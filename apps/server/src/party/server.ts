/**
 * Live Parties by link code, Friends' presence, and the `/ws` socket every tab holds. Each connection's messages run
 * one at a time in arrival order; a Party changes only synchronously, so strokes from different players apply in the
 * order they came. A player is online while any tab has said `hello`, and in at most one Party, whatever their tabs.
 * A grid is written back as its owner's progress every 30s while it changes, when the Party moves on and when it ends;
 * on shutdown every Party is saved to `party` and restored on the next boot, where players reconnect to it.
 */
import { randomInt } from 'node:crypto'
import type { IncomingMessage, Server } from 'node:http'
import type { Duplex } from 'node:stream'
import { type WebSocket, WebSocketServer } from 'ws'
import {
  DEVICE_TOKEN,
  type FriendPresence,
  PARTY_CLOSE,
  PARTY_PROTOCOL,
  type PartyChange,
  type PartyEndReason,
  type PartyInfo,
  type PartyInvite,
  type PartyServerMsg,
  guestName,
} from '@pixel-imperium/protocol'
import { and, eq, or, sql } from 'drizzle-orm'
import type { Auth } from '../auth.ts'
import type { Db } from '../db/index.ts'
import { friendship, party as partyTable, progress, solve, user } from '../db/schema.ts'
import { type Catalog, type Found, type Viewer, upsertProgress } from '../catalog.ts'
import type { FriendsHub } from '../friends.ts'
import { loadMadePuzzle } from '../made.ts'
import { rateLimiter } from '../rate-limit.ts'
import { decideAccess } from './access.ts'
import { Grid } from './grid.ts'
import { type Identity, Party, type SeatHolder } from './party.ts'

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
  party: Party
  /** The grid's puzzle, for the catalog's questions about it. */
  found: Found | null
  savedAt: number
}

interface Conn {
  ws: WebSocket
  /** Set by `hello`; until then the tab is neither online nor anyone's. */
  identity: Identity | null
  userId: string | null
  handle: string | null
  /** The puzzle page the tab is on. */
  here: string | null
  alive: boolean
  queue: Promise<void>
  /** Cursor and ping messages in the current second, to drop a flood. */
  burst: { start: number; cursors: number; pings: number }
}

interface Invite {
  id: string
  from: string
  toId: string
  live: Live
}

type SessionUser = Auth['$Infer']['Session']['user']

export interface PartyDeps {
  db: Db
  auth: Auth
  catalog: Catalog
  now?: () => number
}

export class PartyHub implements FriendsHub {
  readonly catalog: Catalog
  private readonly db: Db
  private readonly auth: Auth
  private readonly now: () => number
  /** By current and replaced link codes alike. */
  private readonly byCode = new Map<string, Live>()
  private readonly ended = new Set<string>()
  private readonly conns = new Set<Conn>()
  /** Every tab that has said `hello`, by player. */
  private readonly tabs = new Map<Identity, Set<Conn>>()
  private readonly memberOf = new Map<Identity, Live>()
  /** Each online player's Friends, by id, with their Handles. */
  private readonly friendsOf = new Map<string, Map<string, string>>()
  private readonly invites = new Map<string, Invite>()
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 })
  private readonly timers: NodeJS.Timeout[] = []
  private readonly hintAllowed = rateLimiter(60, 60_000)
  private readonly startAllowed = rateLimiter(30, 60 * 60_000)
  private readonly inviteAllowed = rateLimiter(60, 60 * 60_000)

  constructor({ db, auth, catalog, now = Date.now }: PartyDeps) {
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

  private parties(): Live[] {
    return [...new Set(this.byCode.values())]
  }

  private isLive(live: Live): boolean {
    return this.byCode.get(live.party.code) === live
  }

  private tabsOf(identity: Identity): Set<Conn> {
    return this.tabs.get(identity) ?? new Set()
  }

  private tabsIn(live: Live): Conn[] {
    return live.party.holders().flatMap(h => [...this.tabsOf(h.identity)])
  }

  private send(conn: Conn, msg: PartyServerMsg): void {
    if (conn.ws.readyState === conn.ws.OPEN) conn.ws.send(JSON.stringify(msg))
  }

  private sendTo(identity: Identity, msg: PartyServerMsg): void {
    for (const c of this.tabsOf(identity)) this.send(c, msg)
  }

  private broadcast(live: Live, msg: PartyServerMsg, except?: Conn): void {
    for (const c of this.tabsIn(live)) if (c !== except) this.send(c, msg)
  }

  /** To the tabs on the grid's puzzle page. */
  private broadcastHere(live: Live, msg: PartyServerMsg, except?: Conn): void {
    const id = live.party.grid?.puzzle.id
    for (const c of this.tabsIn(live)) if (c !== except && c.here === id) this.send(c, msg)
  }

  // Presence

  presenceOf(userId: string): { online: boolean; party: number | null } {
    const identity: Identity = `user:${userId}`
    return { online: this.tabs.has(identity), party: this.memberOf.get(identity)?.party.size ?? null }
  }

  private presenceEntry(userId: string, handle: string): FriendPresence {
    return { handle, ...this.presenceOf(userId) }
  }

  /** Tells every online friend of `userId` how they now stand. */
  private announce(userId: string | null): void {
    if (!userId) return
    for (const [friendId, friends] of this.friendsOf) {
      const handle = friends.get(userId)
      if (handle) this.sendTo(`user:${friendId}`, { type: 'presence', friends: [this.presenceEntry(userId, handle)], full: false })
    }
  }

  private presenceList(userId: string): PartyServerMsg {
    const friends = [...(this.friendsOf.get(userId) ?? [])].map(([id, handle]) => this.presenceEntry(id, handle))
    return { type: 'presence', friends, full: true }
  }

  private async loadFriends(userId: string): Promise<Map<string, string>> {
    const other = sql<string>`case when ${friendship.userA} = ${userId} then ${friendship.userB} else ${friendship.userA} end`
    const rows = await this.db
      .select({ id: user.id, handle: user.handle })
      .from(friendship)
      .innerJoin(user, eq(user.id, other))
      .where(or(eq(friendship.userA, userId), eq(friendship.userB, userId)))
    return new Map(rows.flatMap(r => (r.handle ? [[r.id, r.handle] as const] : [])))
  }

  friendRequested(toId: string, from: string): void {
    this.sendTo(`user:${toId}`, { type: 'friendRequest', from })
  }

  /** Friendships changed between these players: their lists reload and go out whole. */
  async friendsChanged(...userIds: string[]): Promise<void> {
    for (const id of userIds) {
      if (!this.tabs.has(`user:${id}`)) continue
      this.friendsOf.set(id, await this.loadFriends(id))
      this.sendTo(`user:${id}`, this.presenceList(id))
    }
  }

  // Sockets

  private open(ws: WebSocket, req: IncomingMessage): void {
    const conn: Conn = {
      ws,
      identity: null,
      userId: null,
      handle: null,
      here: null,
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
      conn.queue = conn.queue.then(() => this.receive(conn, data.toString())).catch(e => console.error('party message failed', e))
    })
    ws.on('close', () => this.closed(conn))
  }

  private closed(conn: Conn): void {
    this.conns.delete(conn)
    const identity = conn.identity
    if (!identity) return
    const tabs = this.tabsOf(identity)
    tabs.delete(conn)
    const live = this.memberOf.get(identity)
    if (live) {
      const seat = live.party.seatOf(identity)
      live.party.disconnect(seat, this.now())
      this.syncHere(live, identity)
      this.broadcast(live, { type: 'seats', seats: live.party.seatList() })
    }
    if (tabs.size > 0) return
    this.tabs.delete(identity)
    if (conn.userId) {
      this.announce(conn.userId)
      this.friendsOf.delete(conn.userId)
    }
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
    if (msg.type === 'hello') return this.hello(conn, msg)
    const identity = conn.identity
    if (!identity) return conn.ws.close(PARTY_CLOSE.notAllowed, 'hello first')
    const live = this.memberOf.get(identity)
    const seat = live ? live.party.seatOf(identity) : -1
    const host = !!live && live.party.isHost(seat)
    switch (msg.type) {
      case 'start':
        if (conn.userId && !live && this.startAllowed(conn.userId)) this.partyChanged(this.create(conn))
        return
      case 'invite':
        if (live && typeof msg.handle === 'string') this.invite(conn, live, msg.handle)
        return
      case 'respond':
        if (typeof msg.inviteId === 'string') await this.respond(conn, msg.inviteId, msg.accept === true)
        return
      case 'join':
        if (typeof msg.code === 'string') await this.joinByLink(conn, msg.code, msg.started === true)
        return
      case 'leave':
        if (live) this.leave(identity, live)
        return
      case 'makeHost':
        if (live && typeof msg.seat === 'number' && live.party.makeHost(seat, msg.seat)) this.hostChanged(live)
        return
      case 'remove': {
        const removed = host && typeof msg.seat === 'number' ? live!.party.remove(seat, msg.seat) : null
        if (!removed) return
        this.memberOf.delete(removed.identity)
        this.sendTo(removed.identity, { type: 'removed' })
        this.sendTo(removed.identity, { type: 'party', party: null, you: null })
        this.partyChanged(live!)
        return this.announce(removed.userId)
      }
      case 'newLink': {
        if (!host) return
        live!.party.relink(this.freshCode())
        this.byCode.set(live!.party.code, live!)
        return this.broadcast(live!, { type: 'link', code: live!.party.code })
      }
      case 'end':
        if (host) await this.end(live!, 'host')
        return
      case 'play':
        if (typeof msg.puzzleId === 'string') await this.play(conn, msg.puzzleId)
        return
      case 'here':
        return this.arrive(conn, typeof msg.puzzleId === 'string' ? msg.puzzleId : null)
    }

    const grid = live?.party.grid
    if (!live || !grid || conn.here !== grid.puzzle.id) return
    switch (msg.type) {
      case 'stroke': {
        if (typeof msg.id !== 'number') return
        const changes = grid.stroke(seat, msg.changes, msg.joins === true)
        if (changes) this.applied(live, seat, msg.id, changes)
        return
      }
      case 'cancel': {
        const changes = grid.cancel(seat)
        if (changes.length > 0) this.applied(live, seat, null, changes)
        return
      }
      case 'undo': {
        const changes = grid.undo(seat)
        if (changes.length > 0) this.applied(live, seat, null, changes)
        return
      }
      case 'clear': {
        const changes = live.party.clear(seat)
        if (changes) this.broadcastHere(live, { type: 'stroke', id: null, by: seat, changes })
        return
      }
      case 'cursor': {
        if (!this.allowBurst(conn, 'cursors') || !grid.point(seat, msg.i)) return
        return this.broadcastHere(live, { type: 'cursor', seat, i: grid.cursorOf(seat) }, conn)
      }
      case 'ping': {
        if (!this.allowBurst(conn, 'pings') || !grid.inGrid(msg.i)) return
        return this.broadcastHere(live, { type: 'ping', seat, i: msg.i }, conn)
      }
      case 'hint': {
        if (!this.hintAllowed(identity)) return
        const hint = grid.hint()
        if (hint) this.broadcastHere(live, { type: 'hint', by: seat, hint })
        return
      }
    }
  }

  private async hello(conn: Conn, msg: Record<string, unknown>): Promise<void> {
    if (conn.identity) return
    if (msg.protocol !== PARTY_PROTOCOL) {
      this.send(conn, { type: 'outdated' })
      return conn.ws.close(PARTY_CLOSE.outdated, 'outdated')
    }
    const token = typeof msg.deviceToken === 'string' && DEVICE_TOKEN.test(msg.deviceToken) ? msg.deviceToken : null
    const identity = identityOf(conn.userId, token)
    if (!identity) return conn.ws.close(PARTY_CLOSE.notAllowed, 'bad hello')
    const online = this.tabs.has(identity)
    const friends = conn.userId && !online ? await this.loadFriends(conn.userId) : null
    if (conn.ws.readyState !== conn.ws.OPEN) return

    conn.identity = identity
    if (!this.tabs.has(identity)) this.tabs.set(identity, new Set())
    this.tabs.get(identity)!.add(conn)
    if (friends) this.friendsOf.set(conn.userId!, friends)

    const live = this.memberOf.get(identity)
    if (live) {
      live.party.connect(live.party.seatOf(identity))
      this.broadcast(live, { type: 'seats', seats: live.party.seatList() }, conn)
    }
    this.sendParty(conn)
    if (!conn.userId) return
    this.send(conn, this.presenceList(conn.userId))
    for (const inv of this.invites.values()) if (inv.toId === conn.userId) this.send(conn, { type: 'invite', invite: this.inviteView(inv) })
    if (!online) this.announce(conn.userId)
  }

  // Membership

  private sendParty(conn: Conn): void {
    const live = conn.identity ? this.memberOf.get(conn.identity) : undefined
    if (!live) return this.send(conn, { type: 'party', party: null, you: null })
    this.send(conn, { type: 'party', party: live.party.state(), you: live.party.seatOf(conn.identity!) })
  }

  /** Sends the Party whole to every member, as after a join, a leave or a new puzzle. */
  private partyChanged(live: Live): void {
    for (const c of this.tabsIn(live)) this.sendParty(c)
  }

  private hostChanged(live: Live): void {
    this.broadcast(live, { type: 'host', seat: live.party.hostSeat })
    this.partyChanged(live)
  }

  /** How many of the seat holder's tabs are on the grid's page. */
  private syncHere(live: Live, identity: Identity): void {
    const seat = live.party.seatOf(identity)
    if (seat < 0) return
    const id = live.party.grid?.puzzle.id
    live.party.setHere(seat, id ? [...this.tabsOf(identity)].filter(c => c.here === id).length : 0)
  }

  private freshCode(): string {
    for (;;) {
      const code = randomCode()
      if (!this.byCode.has(code) && !this.ended.has(code)) return code
    }
  }

  private create(conn: Conn): Live {
    const party = Party.create({
      code: this.freshCode(),
      host: { identity: conn.identity!, userId: conn.userId!, name: conn.handle! },
      now: this.now(),
    })
    const live: Live = { party, found: null, savedAt: this.now() }
    this.byCode.set(party.code, live)
    this.memberOf.set(conn.identity!, live)
    for (const _ of this.tabsOf(conn.identity!)) party.connect(0)
    this.syncHere(live, conn.identity!)
    this.announce(conn.userId)
    return live
  }

  /**
   * Seats the player in `live`, out of any Party they were in. Synchronous from the access check on, so the seat it
   * found free is still free.
   */
  private enter(identity: Identity, holder: Omit<SeatHolder, 'identity'>, live: Live): boolean {
    const old = this.memberOf.get(identity)
    if (old === live) return true
    const { party } = live
    const bumped = party.holder(party.freeSeat())
    if (party.freeSeat() < 0) return false
    if (old) this.leave(identity, old)
    const seat = party.take({ identity, ...holder }, this.now())
    if (bumped) {
      this.memberOf.delete(bumped.identity)
      this.announce(bumped.userId)
    }
    this.memberOf.set(identity, live)
    for (const _ of this.tabsOf(identity)) party.connect(seat)
    this.syncHere(live, identity)
    this.partyChanged(live)
    this.announce(holder.userId)
    for (const inv of this.invites.values()) if (inv.live === live && `user:${inv.toId}` === identity) this.dropInvite(inv)
    const grid = party.grid
    if (grid) for (const c of this.tabsOf(identity)) if (c.here === grid.puzzle.id) this.sendGrid(live, c)
    return true
  }

  private leave(identity: Identity, live: Live): void {
    const { party } = live
    const holder = party.holder(party.seatOf(identity))!
    this.memberOf.delete(identity)
    const { host, hostless } = party.leave(party.seatOf(identity), this.now())
    this.sendTo(identity, { type: 'party', party: null, you: null })
    this.announce(holder.userId)
    if (hostless) return void this.end(live, 'hostless').catch(e => console.error('ending a party failed', e))
    if (host !== null) this.broadcast(live, { type: 'host', seat: host })
    this.partyChanged(live)
  }

  private holderFor(conn: Conn, live: Live): Omit<SeatHolder, 'identity'> {
    const token = conn.identity!.startsWith('device:') ? conn.identity!.slice('device:'.length) : null
    return { userId: conn.userId, name: conn.handle ?? guestName(token!, live.party.names()) }
  }

  private async access(live: Live | undefined, code: string | null, identity: Identity | null, viewer: Viewer) {
    const party = live?.party
    const seated = !!party && identity !== null && party.seatOf(identity) >= 0
    const found = live?.found
    const retired = found && !seated && 'made' in found && found.made.retired ? found : null
    const retiredClosed = retired ? !(await this.catalog.mayPlayRetired(viewer, retired.authorId, retired.startedIds)) : false
    return decideAccess({
      party: live ? 'live' : code !== null && this.ended.has(code) ? 'ended' : null,
      seated,
      removed: !!party && identity !== null && party.isRemoved(identity),
      invited: code === null,
      oldLink: !!party && code !== null && party.code !== code,
      seatFree: !!party && party.freeSeat() >= 0,
      retiredClosed,
    })
  }

  private async joinByLink(conn: Conn, code: string, started: boolean): Promise<void> {
    const access = await this.access(this.byCode.get(code), code, conn.identity, { userId: conn.userId, started })
    // Re-read after the await: the Party may have ended or filled meanwhile.
    const live = this.byCode.get(code)
    if (access !== 'join' || !live) return this.send(conn, { type: 'refused', reason: access === 'join' ? 'ended' : access })
    if (this.memberOf.get(conn.identity!) === live) return this.sendParty(conn)
    if (!this.enter(conn.identity!, this.holderFor(conn, live), live)) this.send(conn, { type: 'refused', reason: 'full' })
  }

  // Invites

  private inviteView(inv: Invite): PartyInvite {
    const { party } = inv.live
    return { id: inv.id, from: inv.from, host: party.hostName, size: party.size, puzzle: party.state().puzzle }
  }

  private dropInvite(inv: Invite): void {
    this.invites.delete(inv.id)
    this.sendTo(`user:${inv.toId}`, { type: 'uninvite', id: inv.id })
  }

  private invite(conn: Conn, live: Live, handle: string): void {
    if (!conn.userId || !this.inviteAllowed(conn.userId)) return
    const wanted = handle.toLowerCase()
    const [toId] = [...(this.friendsOf.get(conn.userId) ?? [])].find(([, h]) => h.toLowerCase() === wanted) ?? []
    if (!toId || this.memberOf.get(`user:${toId}`) === live) return
    for (const inv of this.invites.values()) if (inv.live === live && inv.toId === toId) this.dropInvite(inv)
    const inv: Invite = { id: randomCode(), from: conn.handle!, toId, live }
    this.invites.set(inv.id, inv)
    this.sendTo(`user:${toId}`, { type: 'invite', invite: this.inviteView(inv) })
  }

  private async respond(conn: Conn, id: string, accept: boolean): Promise<void> {
    const inv = this.invites.get(id)
    if (!inv || inv.toId !== conn.userId) return
    this.dropInvite(inv)
    if (!accept) return
    if (!this.isLive(inv.live)) return this.send(conn, { type: 'refused', reason: 'ended' })
    const access = await this.access(inv.live, null, conn.identity, { userId: conn.userId, started: false })
    if (access !== 'join' || !this.isLive(inv.live)) return this.send(conn, { type: 'refused', reason: access === 'join' ? 'ended' : access })
    if (!this.enter(conn.identity!, this.holderFor(conn, inv.live), inv.live)) this.send(conn, { type: 'refused', reason: 'full' })
  }

  // Puzzles

  private sendGrid(live: Live, conn: Conn): void {
    const grid = live.party.grid!
    this.send(conn, { type: 'snapshot', grid: grid.view() })
    if (grid.solved) this.send(conn, { type: 'solved', palette: live.found!.palette, foil: false, ...this.crest(live.found!) })
  }

  private arrive(conn: Conn, puzzleId: string | null): void {
    if (conn.here === puzzleId) return
    conn.here = puzzleId
    const live = this.memberOf.get(conn.identity!)
    if (!live) return
    this.syncHere(live, conn.identity!)
    if (live.party.grid && puzzleId === live.party.grid.puzzle.id) this.sendGrid(live, conn)
    this.broadcast(live, { type: 'seats', seats: live.party.seatList() })
  }

  /**
   * The Party solves `puzzleId` next, from its starter's progress; in no Party, a signed-in player starts one on it.
   * Tabs on the old puzzle's page move with it; members with none there are told it started.
   */
  private async play(conn: Conn, puzzleId: string): Promise<void> {
    const identity = conn.identity!
    const mayPlay = () => {
      const live = this.memberOf.get(identity)
      return !live || live.party.isHost(live.party.seatOf(identity))
    }
    if (!conn.userId || !mayPlay()) return
    const found = await this.catalog.findPuzzle({ userId: conn.userId, started: false }, puzzleId)
    if ('status' in found || 'date' in found.puzzle || !mayPlay()) return
    let live = this.memberOf.get(identity)
    if (!live) {
      if (!this.startAllowed(conn.userId)) return
      live = this.create(conn)
    }
    const previous = live.party.grid?.puzzle.id ?? null
    if (previous === puzzleId) return this.partyChanged(live)

    await this.writeBack(live)
    const { cells, replaying } = await this.seed(conn.userId, found.puzzle)
    if (!this.isLive(live) || !mayPlay()) return
    live.found = found.puzzle
    live.party.grid = new Grid({ puzzle: found.puzzle, ownerId: conn.userId, cells, replaying })
    live.savedAt = this.now()

    for (const c of this.tabsIn(live)) {
      if (previous === null || c.here !== previous) continue
      this.send(c, { type: 'move', puzzleId })
      c.here = puzzleId
    }
    for (const h of live.party.holders()) this.syncHere(live, h.identity)
    this.partyChanged(live)
    for (const c of this.tabsIn(live)) if (c.here === puzzleId) this.sendGrid(live, c)
    const started = { type: 'started', puzzleId, title: found.puzzle.title, by: conn.handle! } as const
    for (const h of live.party.holders()) {
      if (h.identity === identity || [...this.tabsOf(h.identity)].some(c => c.here === puzzleId)) continue
      this.sendTo(h.identity, started)
    }
  }

  /** The starter's grid to start from: their Attempt, or empty as a Replay once they've solved it. */
  private async seed(ownerId: string, p: Found): Promise<{ cells: string; replaying: boolean }> {
    const [[grid], [solved]] = await Promise.all([
      this.db.select().from(progress).where(and(eq(progress.userId, ownerId), eq(progress.puzzleId, p.id))),
      this.db
        .select({ verified: solve.verified })
        .from(solve)
        .where(and(eq(solve.userId, ownerId), eq(solve.puzzleId, p.id))),
    ])
    const empty = '.'.repeat(p.width * p.height)
    if (!solved) return { cells: grid?.cells ?? empty, replaying: false }
    return { cells: grid?.replaying ? grid.cells : empty, replaying: true }
  }

  private applied(live: Live, seat: number, id: number | null, changes: PartyChange[]) {
    const grid = live.party.grid!
    this.broadcastHere(live, { type: 'stroke', id, by: seat, changes })
    this.broadcastHere(live, { type: 'cursor', seat, i: grid.cursorOf(seat) })
    if (grid.checkSolved()) void this.solved(live).catch(e => console.error('party solve failed', e))
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
    const grid = live.party.grid
    const p = live.found!
    for (const holder of live.party.holders()) {
      let stamps
      if (holder.userId && !this.catalog.isOwn(holder.userId, p)) {
        const recorded = await this.catalog
          .recordSolve(this.db, holder.userId, p.id, 'verified', false)
          .returning({ id: solve.puzzleId })
        if (!('made' in p)) stamps = await this.catalog.solveStamps(holder.userId, p, recorded.length > 0)
      }
      // The Party may have moved on while the solve was written.
      if (live.party.grid !== grid) return
      for (const c of this.tabsOf(holder.identity)) {
        if (c.here !== p.id) continue
        this.send(c, { type: 'solved', palette: p.palette, foil: false, ...this.crest(p), ...(stamps && { stamps }) })
      }
    }
  }

  /** The shared grid as its owner's progress, unless nothing changed or it's their own puzzle. */
  private async writeBack(live: Live): Promise<void> {
    const grid = live.party.grid
    live.savedAt = this.now()
    if (!grid || !grid.dirty || this.catalog.isOwn(grid.ownerId, live.found!)) return
    grid.dirty = false
    const updatedAt = new Date(this.now())
    await upsertProgress(this.db, grid.ownerId, grid.puzzle.id, { cells: grid.text, replaying: grid.replaying, updatedAt })
  }

  // Ending

  private forget(live: Live): void {
    for (const code of [live.party.code, ...live.party.previousCodes]) {
      this.byCode.delete(code)
      this.ended.add(code)
    }
    for (const code of this.ended) {
      if (this.ended.size <= ENDED_KEPT) break
      this.ended.delete(code)
    }
  }

  async end(live: Live, reason: PartyEndReason): Promise<void> {
    if (!this.isLive(live)) return
    const tabs = this.tabsIn(live)
    const holders = live.party.holders()
    this.forget(live)
    for (const h of holders) this.memberOf.delete(h.identity)
    for (const inv of this.invites.values()) if (inv.live === live) this.dropInvite(inv)
    // Written before anyone hears, so the owner's next read of their progress already has the grid.
    try {
      await this.writeBack(live)
    } finally {
      for (const c of tabs) this.send(c, { type: 'ended', reason })
      for (const h of holders) this.announce(h.userId)
    }
  }

  /**
   * Ends Parties nobody has been in for `IDLE_END_MS`, passes on Hosts gone past the grace, and writes back grids
   * changed `AUTOSAVE_MS` ago or more.
   */
  async sweep(): Promise<void> {
    const t = this.now()
    for (const live of this.parties()) {
      try {
        if (live.party.emptySince !== null && t - live.party.emptySince >= IDLE_END_MS) {
          await this.end(live, 'idle')
          continue
        }
        if (live.party.passHost(t) >= 0) this.hostChanged(live)
        if (t - live.savedAt >= AUTOSAVE_MS) await this.writeBack(live)
      } catch (e) {
        console.error('party sweep failed', e)
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

  /** The join card's view of a link; `null` for a code that never was. */
  async info(code: string, viewer: Viewer, handle: string | null, deviceToken: string | null): Promise<PartyInfo | null> {
    const live = this.byCode.get(code)
    const identity = identityOf(viewer.userId, deviceToken)
    const access = await this.access(live, code, identity, viewer)
    if (access === 'not-found') return null
    if (access === 'ended' || !live) return { access: 'ended' }
    const { party, found } = live
    const seat = identity ? party.seatOf(identity) : -1
    const you = seat >= 0 ? party.holder(seat)!.name : (handle ?? (deviceToken ? guestName(deviceToken, party.names()) : undefined))
    return {
      access,
      host: party.hostName,
      seats: party.seatList(),
      puzzle: party.state().puzzle,
      seated: seat >= 0,
      ...(you !== undefined && { you }),
      ...(access === 'retired-closed' && found && 'made' in found && { author: found.made.author }),
    }
  }

  /** On shutdown: write back every grid, save every Party, and tell everyone to reconnect. */
  async shutdown(): Promise<void> {
    for (const t of this.timers) clearInterval(t)
    // One by one, so a Party whose Host deleted their Account can't sink the rest.
    for (const live of this.parties()) {
      try {
        await this.writeBack(live)
        await this.db
          .insert(partyTable)
          .values({ ...live.party.save(), hostId: live.party.hostId })
          .onConflictDoNothing()
      } catch (e) {
        console.error('saving a party failed', e)
      }
    }
    for (const c of this.conns) c.ws.close(PARTY_CLOSE.restarting, 'restarting')
    this.byCode.clear()
    this.memberOf.clear()
    this.invites.clear()
  }

  /** On boot: brings back the Parties the last shutdown saved, waiting for their players. */
  async restore(): Promise<number> {
    const rows = await this.db.delete(partyTable).returning()
    for (const saved of rows) {
      const found = saved.grid && ((this.catalog.puzzleById(saved.grid.puzzleId) ?? (await loadMadePuzzle(this.db, saved.grid.puzzleId))) || null)
      const grid = saved.grid && found ? new Grid({ ...saved.grid, puzzle: found }) : null
      const party = new Party({ ...saved, grid, now: this.now() })
      const live: Live = { party, found: grid && found, savedAt: this.now() }
      for (const code of [party.code, ...party.previousCodes]) this.byCode.set(code, live)
      for (const h of party.holders()) this.memberOf.set(h.identity, live)
    }
    return rows.length
  }
}

function identityOf(userId: string | null, deviceToken: string | null): Identity | null {
  return userId ? `user:${userId}` : deviceToken ? `device:${deviceToken}` : null
}
