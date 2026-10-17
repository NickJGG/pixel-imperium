/**
 * Live co-ops by link code, and the `/ws` sockets that play them. Each connection's messages run one at a time in
 * arrival order; a room changes only synchronously, so strokes from different players apply in the order they came.
 * The Host's grid is written back as their progress every 30s while it changes and when the co-op ends; on shutdown
 * every co-op is saved to `coop_room` and restored on the next boot, where players reconnect to it.
 */
import { randomInt } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { type WebSocket, WebSocketServer } from 'ws'
import {
  COOP_CLOSE,
  COOP_PROTOCOL,
  type CoopChange,
  type CoopEndReason,
  type CoopRoomInfo,
  type CoopServerMsg,
  type ApiError,
  DEVICE_TOKEN,
  guestName,
} from '@pixel-imperium/protocol'
import { and, eq } from 'drizzle-orm'
import type { Auth } from '../auth.ts'
import type { Db } from '../db/index.ts'
import { coopRoom, progress, solve } from '../db/schema.ts'
import { type Catalog, type Found, type Viewer, upsertProgress } from '../catalog.ts'
import { loadMadePuzzle } from '../made.ts'
import { rateLimiter } from '../rate-limit.ts'
import { decideAccess } from './access.ts'
import { type Identity, Room } from './room.ts'

export const IDLE_END_MS = 10 * 60_000
export const AUTOSAVE_MS = 30_000
const SWEEP_MS = 5_000
const HEARTBEAT_MS = 30_000
/** Client cursors send about 20 a second; this leaves room for jitter. */
const CURSORS_PER_SECOND = 30
const PINGS_PER_SECOND = 4
const ENDED_KEPT = 10_000

const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789'
const randomCode = () => Array.from({ length: 8 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')

interface Live {
  room: Room
  puzzle: Found
  conns: Set<Conn>
  savedAt: number
}

interface Conn {
  ws: WebSocket
  identity: Identity | null
  userId: string | null
  handle: string | null
  live: Live | null
  seat: number
  alive: boolean
  queue: Promise<void>
  /** Cursor and ping messages in the current second, to drop a flood. */
  burst: { start: number; cursors: number; pings: number }
}

type SessionUser = Auth['$Infer']['Session']['user']

export interface CoopDeps {
  db: Db
  auth: Auth
  catalog: Catalog
  now?: () => number
}

export class CoopRooms {
  readonly catalog: Catalog
  private readonly db: Db
  private readonly auth: Auth
  private readonly now: () => number
  /** By current and replaced link codes alike. */
  private readonly rooms = new Map<string, Live>()
  private readonly ended = new Set<string>()
  private readonly conns = new Set<Conn>()
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
  private readonly timers: NodeJS.Timeout[] = []
  private readonly hintAllowed = rateLimiter(60, 60_000)

  constructor({ db, auth, catalog, now = Date.now }: CoopDeps) {
    this.db = db
    this.auth = auth
    this.catalog = catalog
    this.now = now
  }

  /** Takes `/ws` upgrades on `server` and starts the timers. */
  attach(server: Pick<Server, 'on'>): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') return void socket.destroy()
      this.wss.handleUpgrade(req, socket, head, ws => this.open(ws, req))
    })
    this.timers.push(
      setInterval(() => void this.sweep(), SWEEP_MS),
      setInterval(() => this.heartbeat(), HEARTBEAT_MS),
    )
  }

  private live(): Live[] {
    return [...new Set(this.rooms.values())]
  }

  /** Starts a co-op for a signed-in Host, or returns the one they already host on that puzzle. */
  async create(host: { id: string; handle: string }, puzzleId: string): Promise<{ code: string } | { status: 400 | 404 | 410; error: ApiError }> {
    const found = await this.catalog.findPuzzle({ userId: host.id, started: false }, puzzleId)
    if ('status' in found) return found
    if ('date' in found.puzzle) return { status: 400, error: { error: 'a Daily is played solo' } }
    const existing = this.live().find(l => l.room.hostId === host.id && l.room.puzzle.id === puzzleId)
    if (existing) return { code: existing.room.code }

    const { cells, replaying } = await this.seed(host.id, found.puzzle)
    const room = Room.create({
      code: this.freshCode(),
      host: { identity: `user:${host.id}`, userId: host.id, name: host.handle },
      puzzle: found.puzzle,
      cells,
      replaying,
      now: this.now(),
    })
    this.rooms.set(room.code, { room, puzzle: found.puzzle, conns: new Set(), savedAt: this.now() })
    return { code: room.code }
  }

  /** The Host's grid to start from: their Attempt, or empty as a Replay once they've solved it. */
  private async seed(hostId: string, p: Found): Promise<{ cells: string; replaying: boolean }> {
    const [[grid], [solved]] = await Promise.all([
      this.db.select().from(progress).where(and(eq(progress.userId, hostId), eq(progress.puzzleId, p.id))),
      this.db
        .select({ verified: solve.verified })
        .from(solve)
        .where(and(eq(solve.userId, hostId), eq(solve.puzzleId, p.id))),
    ])
    const empty = '.'.repeat(p.width * p.height)
    if (!solved) return { cells: grid?.cells ?? empty, replaying: false }
    return { cells: grid?.replaying ? grid.cells : empty, replaying: true }
  }

  private freshCode(): string {
    for (;;) {
      const code = randomCode()
      if (!this.rooms.has(code) && !this.ended.has(code)) return code
    }
  }

  private async access(live: Live | undefined, code: string, identity: Identity | null, viewer: Viewer) {
    const room = live?.room
    const seated = !!room && identity !== null && room.seatOf(identity) >= 0
    const retired = room && !seated && 'made' in live!.puzzle && live!.puzzle.made.retired ? live!.puzzle : null
    const retiredClosed = retired ? !(await this.catalog.mayPlayRetired(viewer, retired.authorId, retired.startedIds)) : false
    return decideAccess({
      room: live ? 'live' : this.ended.has(code) ? 'ended' : null,
      seated,
      removed: !!room && identity !== null && room.isRemoved(identity),
      oldLink: !!room && room.code !== code,
      seatFree: !!room && room.freeSeat() >= 0,
      retiredClosed,
    })
  }

  /** The join card's view of a link; `null` for a code that never was. */
  async info(code: string, viewer: Viewer, handle: string | null, deviceToken: string | null): Promise<CoopRoomInfo | null> {
    const live = this.rooms.get(code)
    const identity = identityOf(viewer.userId, deviceToken)
    const access = await this.access(live, code, identity, viewer)
    if (access === 'not-found') return null
    if (access === 'ended' || !live) return { access: 'ended' }
    const { room, puzzle } = live
    const seat = identity ? room.seatOf(identity) : -1
    const you = seat >= 0 ? room.holder(seat)!.name : (handle ?? (deviceToken ? guestName(deviceToken, room.names()) : undefined))
    return {
      access,
      host: room.hostName,
      puzzleId: puzzle.id,
      title: puzzle.title,
      seats: room.seatList(),
      seated: seat >= 0,
      ...(you !== undefined && { you }),
      ...(access === 'retired-closed' && 'made' in puzzle && { author: puzzle.made.author }),
    }
  }

  private open(ws: WebSocket, req: IncomingMessage): void {
    const conn: Conn = {
      ws,
      identity: null,
      userId: null,
      handle: null,
      live: null,
      seat: -1,
      alive: true,
      queue: this.session(req).then(user => {
        conn.userId = user?.id ?? null
        conn.handle = user ? (user.handle ?? user.name) : null
      }),
      burst: { start: 0, cursors: 0, pings: 0 },
    }
    this.conns.add(conn)
    ws.on('pong', () => (conn.alive = true))
    ws.on('message', (data, isBinary) => {
      if (isBinary) return
      conn.queue = conn.queue.then(() => this.receive(conn, data.toString())).catch(e => console.error('co-op message failed', e))
    })
    ws.on('close', () => {
      this.conns.delete(conn)
      const live = conn.live
      if (!live) return
      live.conns.delete(conn)
      live.room.disconnect(conn.seat, this.now())
      this.broadcast(live, { type: 'seats', seats: live.room.seatList() })
    })
  }

  private async session(req: IncomingMessage): Promise<SessionUser | null> {
    const headers = new Headers()
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)
    try {
      return (await this.auth.api.getSession({ headers }))?.user ?? null
    } catch {
      return null
    }
  }

  private send(conn: Conn, msg: CoopServerMsg): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg))
  }

  private broadcast(live: Live, msg: CoopServerMsg, except?: Conn): void {
    const data = JSON.stringify(msg)
    for (const c of live.conns) if (c !== except && c.ws.readyState === c.ws.OPEN) c.ws.send(data)
  }

  private allowBurst(conn: Conn, kind: 'cursors' | 'pings'): boolean {
    const t = this.now()
    if (t - conn.burst.start >= 1000) conn.burst = { start: t, cursors: 0, pings: 0 }
    return ++conn.burst[kind] <= (kind === 'cursors' ? CURSORS_PER_SECOND : PINGS_PER_SECOND)
  }

  private async receive(conn: Conn, data: string): Promise<void> {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(data)
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (msg.type === 'join') return this.join(conn, msg)
    const live = conn.live
    if (!live) return conn.ws.close(COOP_CLOSE.notAllowed, 'join first')
    const { room } = live
    const host = conn.seat === 0
    switch (msg.type) {
      case 'stroke': {
        if (typeof msg.id !== 'number') return
        const changes = room.stroke(conn.seat, msg.changes, msg.joins === true)
        if (changes) this.applied(live, conn.seat, msg.id, changes)
        return
      }
      case 'cancel': {
        const changes = room.cancel(conn.seat)
        if (changes.length > 0) this.applied(live, conn.seat, null, changes)
        return
      }
      case 'undo': {
        const changes = room.undo(conn.seat)
        if (changes.length > 0) this.applied(live, conn.seat, null, changes)
        return
      }
      case 'clear': {
        const changes = room.clear(conn.seat)
        if (changes) this.broadcast(live, { type: 'stroke', id: null, by: conn.seat, changes })
        return
      }
      case 'cursor': {
        if (!this.allowBurst(conn, 'cursors') || !room.point(conn.seat, msg.i)) return
        return this.broadcast(live, { type: 'cursor', seat: conn.seat, i: room.cursorOf(conn.seat) }, conn)
      }
      case 'ping': {
        if (!this.allowBurst(conn, 'pings') || !room.inGrid(msg.i)) return
        return this.broadcast(live, { type: 'ping', seat: conn.seat, i: msg.i }, conn)
      }
      case 'hint': {
        if (!this.hintAllowed(conn.identity!)) return
        const hint = room.hint()
        if (hint) this.broadcast(live, { type: 'hint', by: conn.seat, hint })
        return
      }
      case 'next':
        if (host && typeof msg.puzzleId === 'string') await this.next(live, conn, msg.puzzleId)
        return
      case 'remove': {
        const removed = host && typeof msg.seat === 'number' ? room.remove(conn.seat, msg.seat) : null
        if (!removed) return
        for (const c of live.conns) {
          if (c.identity !== removed.identity) continue
          live.conns.delete(c)
          c.live = null
          c.ws.close(COOP_CLOSE.removed, 'removed')
        }
        return this.broadcast(live, { type: 'seats', seats: room.seatList() })
      }
      case 'newLink': {
        if (!host) return
        room.relink(this.freshCode())
        this.rooms.set(room.code, live)
        return this.broadcast(live, { type: 'link', code: room.code })
      }
      case 'end':
        if (host) await this.end(live, 'host')
        return
    }
  }

  private applied(live: Live, seat: number, id: number | null, changes: CoopChange[]) {
    const { room } = live
    this.broadcast(live, { type: 'stroke', id, by: seat, changes })
    this.broadcast(live, { type: 'cursor', seat, i: room.cursorOf(seat) })
    if (room.checkSolved()) void this.solved(live).catch(e => console.error('co-op solve failed', e))
  }

  private async join(conn: Conn, msg: Record<string, unknown>): Promise<void> {
    if (conn.live) return
    const { code, deviceToken, protocol, started } = msg
    if (protocol !== COOP_PROTOCOL) {
      this.send(conn, { type: 'outdated' })
      return conn.ws.close(COOP_CLOSE.outdated, 'outdated')
    }
    const token = typeof deviceToken === 'string' && DEVICE_TOKEN.test(deviceToken) ? deviceToken : null
    conn.identity = identityOf(conn.userId, token)
    if (typeof code !== 'string' || !conn.identity) return conn.ws.close(COOP_CLOSE.notAllowed, 'bad join')

    const viewer = { userId: conn.userId, started: started === true }
    const access = await this.access(this.rooms.get(code), code, conn.identity, viewer)
    // Re-read after the await: the co-op may have ended or filled meanwhile.
    const live = this.rooms.get(code)
    if (access !== 'join' || !live) {
      const close = access === 'full' ? COOP_CLOSE.full : access === 'removed' ? COOP_CLOSE.removed : access === 'ended' ? COOP_CLOSE.ended : COOP_CLOSE.notAllowed
      return conn.ws.close(close, access)
    }
    const { room } = live
    const seat = room.take({
      identity: conn.identity,
      userId: conn.userId,
      name: conn.handle ?? guestName(token!, room.names()),
    })
    if (seat < 0) return conn.ws.close(COOP_CLOSE.full, 'full')
    if (conn.ws.readyState !== conn.ws.OPEN) return

    conn.live = live
    conn.seat = seat
    live.conns.add(conn)
    room.connect(seat)
    this.send(conn, { type: 'snapshot', room: room.state(), you: seat })
    this.broadcast(live, { type: 'seats', seats: room.seatList() }, conn)
    if (room.solved) this.send(conn, { type: 'solved', palette: live.puzzle.palette, foil: false, ...this.crest(live.puzzle) })
  }

  private crest(p: Found) {
    const crest = this.catalog.crestOf(p)
    return crest ? { crest } : {}
  }

  /**
   * Every signed-in player seated at the solve gets a Verified solve, never foil and never a Best time; an Author
   * on their own puzzle records nothing. Stamps come with official puzzles only, as for a solo solve.
   */
  private async solved(live: Live): Promise<void> {
    const p = live.puzzle
    const room = live.room
    const holders = [0, 1, 2, 3].map(k => room.holder(k))
    for (const [seat, holder] of holders.entries()) {
      if (!holder) continue
      let stamps
      if (holder.userId && !this.catalog.isOwn(holder.userId, p)) {
        const recorded = await this.catalog
          .recordSolve(this.db, holder.userId, p.id, 'verified', false)
          .returning({ id: solve.puzzleId })
        if (!('made' in p)) stamps = await this.catalog.solveStamps(holder.userId, p, recorded.length > 0)
      }
      // The puzzle may have moved on while the solve was written.
      if (live.puzzle !== p) return
      for (const c of live.conns) {
        if (c.seat !== seat) continue
        this.send(c, { type: 'solved', palette: p.palette, foil: false, ...this.crest(p), ...(stamps && { stamps }) })
      }
    }
  }

  private async next(live: Live, conn: Conn, puzzleId: string): Promise<void> {
    const found = await this.catalog.findPuzzle({ userId: conn.userId, started: false }, puzzleId)
    if ('status' in found || 'date' in found.puzzle || !this.rooms.has(live.room.code)) return
    await this.writeBack(live)
    const { cells, replaying } = await this.seed(live.room.hostId, found.puzzle)
    live.puzzle = found.puzzle
    live.room.move(found.puzzle, cells, replaying)
    this.broadcast(live, { type: 'moved', puzzleId: found.puzzle.id, cells })
    this.broadcast(live, { type: 'seats', seats: live.room.seatList() })
  }

  /** The shared grid as the Host's progress, unless nothing changed or it's their own puzzle. */
  private async writeBack(live: Live): Promise<void> {
    const { room, puzzle } = live
    live.savedAt = this.now()
    if (!room.dirty || this.catalog.isOwn(room.hostId, puzzle)) return
    room.dirty = false
    const updatedAt = new Date(this.now())
    await upsertProgress(this.db, room.hostId, puzzle.id, { cells: room.grid, replaying: room.replaying, updatedAt })
  }

  private forget(live: Live): void {
    for (const code of [live.room.code, ...live.room.previousCodes]) {
      this.rooms.delete(code)
      this.ended.add(code)
    }
    for (const code of this.ended) {
      if (this.ended.size <= ENDED_KEPT) break
      this.ended.delete(code)
    }
  }

  async end(live: Live, reason: CoopEndReason): Promise<void> {
    if (this.rooms.get(live.room.code) !== live) return
    this.forget(live)
    // Written before anyone hears, so the Host's next read of their progress already has the grid.
    try {
      await this.writeBack(live)
    } finally {
      this.broadcast(live, { type: 'ended', reason })
      for (const c of live.conns) {
        c.live = null
        c.ws.close(COOP_CLOSE.ended, 'ended')
      }
      live.conns.clear()
    }
  }

  /** Ends co-ops nobody has been in for `IDLE_END_MS`, and writes back grids changed `AUTOSAVE_MS` ago or more. */
  async sweep(): Promise<void> {
    const t = this.now()
    for (const live of this.live()) {
      try {
        if (live.room.emptySince !== null && t - live.room.emptySince >= IDLE_END_MS) await this.end(live, 'idle')
        else if (t - live.savedAt >= AUTOSAVE_MS) await this.writeBack(live)
      } catch (e) {
        console.error('co-op sweep failed', e)
      }
    }
  }

  private heartbeat(): void {
    for (const c of this.conns) {
      if (!c.alive) {
        c.ws.terminate()
        continue
      }
      c.alive = false
      c.ws.ping()
    }
  }

  /** On shutdown: write back every Host's grid, save every co-op, and tell everyone to reconnect. */
  async shutdown(): Promise<void> {
    for (const t of this.timers) clearInterval(t)
    // One by one, so a co-op whose Host deleted their Account can't sink the rest.
    for (const live of this.live()) {
      try {
        await this.writeBack(live)
        await this.db.insert(coopRoom).values(live.room.save()).onConflictDoNothing()
      } catch (e) {
        console.error('saving a co-op failed', e)
      }
    }
    for (const c of this.conns) c.ws.close(COOP_CLOSE.restarting, 'restarting')
    this.rooms.clear()
  }

  /** On boot: brings back the co-ops the last shutdown saved, waiting for their players. */
  async restore(): Promise<number> {
    const rows = await this.db.delete(coopRoom).returning()
    for (const saved of rows) {
      const puzzle = this.catalog.puzzleById(saved.puzzleId) ?? (await loadMadePuzzle(this.db, saved.puzzleId))
      if (!puzzle) continue
      const room = new Room({ ...saved, puzzle, now: this.now() })
      const live = { room, puzzle, conns: new Set<Conn>(), savedAt: this.now() }
      for (const code of [room.code, ...room.previousCodes]) this.rooms.set(code, live)
    }
    return rows.length
  }
}

function identityOf(userId: string | null, deviceToken: string | null): Identity | null {
  return userId ? `user:${userId}` : deviceToken ? `device:${deviceToken}` : null
}
