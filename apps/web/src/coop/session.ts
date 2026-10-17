/**
 * One player's side of a co-op: the socket, the grid as the server settled it, and the `PlayStore` playing it.
 * Own strokes show at once and wait as pending until the server echoes them; the store always shows the server's
 * grid with the pending strokes on top, so a partner's stroke over the same cells is undone only if the server
 * applied it later. A snapshot (on each join) replaces everything; strokes drawn while disconnected go out after it.
 */
import type { Cell, Hint } from '@pixel-imperium/nonogram'
import {
  COOP_PROTOCOL,
  type CoopCell,
  type CoopChange,
  type CoopSeat,
  type CoopServerMsg,
} from '@pixel-imperium/protocol'
import type { Change, CoopLink, PlayStore } from '../play/store.ts'
import { initialOf } from './seats.ts'
import { type CoopEnd, CoopSocket, type CoopSocketEnv, type SocketStatus } from './socket.ts'

export type CoopStatus = SocketStatus | CoopEnd

export interface CoopRoomView {
  code: string
  puzzleId: string
  seats: readonly CoopSeat[]
  /** This player's seat. */
  you: number
}

export interface CoopView {
  status: CoopStatus
  /** From the first snapshot on. */
  room: CoopRoomView | null
  /** Who asked for the hint on show. */
  hintBy: number | null
}

export interface Partner {
  seat: number
  index: number
  initial: string
}

export interface PingMark {
  seat: number
  index: number
  initial: string
  /** By `performance.now()`. */
  at: number
}

export interface Presence {
  partners: readonly Partner[]
  pings: readonly PingMark[]
}

export const PING_MS = 1200
const CURSOR_EVERY_MS = 50
const HINT_TIMEOUT_MS = 8000

const ENCODE: Record<Cell, CoopCell> = { empty: '.', filled: '#', marked: 'x' }
const DECODE: Record<CoopCell, Cell> = { '.': 'empty', '#': 'filled', x: 'marked' }
const decode = (cells: string): Cell[] => Array.from(cells, ch => DECODE[ch as CoopCell] ?? 'empty')

interface Pending {
  id: number
  changes: CoopChange[]
  sent: boolean
}

export interface CoopSessionOptions {
  deviceToken: string
  /** A signed-out device's word that it has progress on a Retired puzzle. */
  started?: boolean
  now?: () => number
  socket?: CoopSocketEnv
}

export class CoopSession implements CoopLink {
  private view: CoopView = { status: 'connecting', room: null, hintBy: null }
  private presence: Presence = { partners: [], pings: [] }
  private readonly listeners = new Set<() => void>()
  private readonly presenceListeners = new Set<() => void>()
  private socket: CoopSocket | null = null
  private confirmed: Cell[] = []
  private pending: Pending[] = []
  private strokeId = 0
  private store: PlayStore | null = null
  /** A `solved` that came before the store did. */
  private solvedMsg: Extract<CoopServerMsg, { type: 'solved' }> | null = null
  private hintWaiter: ((hint: Hint | null) => void) | null = null
  private readonly now: () => number

  constructor(
    private readonly code: string,
    private readonly options: CoopSessionOptions,
  ) {
    this.now = options.now ?? (() => performance.now())
  }

  getState = (): CoopView => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getPresence = (): Presence => this.presence

  subscribePresence = (listener: () => void): (() => void) => {
    this.presenceListeners.add(listener)
    return () => this.presenceListeners.delete(listener)
  }

  start(): void {
    if (this.socket || isEnd(this.view.status)) return
    this.socket = new CoopSocket(
      {
        join: () => ({
          type: 'join',
          code: this.view.room?.code ?? this.code,
          deviceToken: this.options.deviceToken,
          protocol: COOP_PROTOCOL,
          ...(this.options.started && { started: true }),
        }),
        onMessage: msg => this.receive(msg),
        onStatus: status => this.patch({ status }),
        onEnd: status => {
          this.socket = null
          this.patch({ status })
        },
      },
      this.options.socket,
    )
  }

  stop(): void {
    this.socket?.close()
    this.socket = null
    this.resolveHint(null)
  }

  /** The grid as this player sees it: the server's, with their pending strokes on top. */
  grid(): Cell[] {
    const cells = this.confirmed.slice()
    for (const p of this.pending) for (const { i, to } of p.changes) cells[i] = DECODE[to]
    return cells
  }

  /** Plays the co-op on `store` until the returned unbind; its pointer goes out as this player's cursor. */
  bind(store: PlayStore): () => void {
    this.store = store
    this.settle()
    if (this.solvedMsg) this.applySolved(this.solvedMsg)
    let pointed: number | null = null
    let sentAt = -Infinity
    let timer: ReturnType<typeof setTimeout> | null = null
    const flush = () => {
      timer = null
      sentAt = this.now()
      this.socket?.send({ type: 'cursor', i: pointed })
    }
    const unsubscribe = store.subscribe(() => {
      const s = store.getState()
      const at = s.hover ?? (s.focused ? s.cursor : null)
      const i = at && at.row * store.puzzle.width + at.col
      if (i === pointed) return
      pointed = i
      if (timer !== null) return
      const wait = sentAt + CURSOR_EVERY_MS - this.now()
      if (wait <= 0) flush()
      else timer = setTimeout(flush, wait)
    })
    return () => {
      unsubscribe()
      if (timer !== null) clearTimeout(timer)
      if (this.store === store) this.store = null
    }
  }

  stroke(changes: readonly Change[]): void {
    const p: Pending = { id: ++this.strokeId, changes: changes.map(c => ({ i: c.index, to: ENCODE[c.to] })), sent: false }
    this.pending.push(p)
    p.sent = this.socket?.send({ type: 'stroke', id: p.id, changes: p.changes }) ?? false
  }

  undo(): void {
    this.socket?.send({ type: 'undo' })
  }

  clear(): void {
    this.socket?.send({ type: 'clear' })
  }

  ping(index: number): void {
    if (!this.socket?.send({ type: 'ping', i: index })) return
    const you = this.view.room?.you
    if (you !== undefined) this.addPing(you, index)
  }

  /** Host only, as are the rest: Next together. */
  next(puzzleId: string): void {
    this.socket?.send({ type: 'next', puzzleId })
  }

  remove(seat: number): void {
    this.socket?.send({ type: 'remove', seat })
  }

  newLink(): void {
    this.socket?.send({ type: 'newLink' })
  }

  end(): void {
    this.socket?.send({ type: 'end' })
  }

  /** Asks for a hint for everyone; resolves with it, or `null` if none comes (solved, or asked too often). */
  requestHint(): Promise<Hint | null> {
    if (!this.socket?.send({ type: 'hint' })) return Promise.reject(new Error('not connected'))
    this.resolveHint(null)
    return new Promise(resolve => {
      const timer = setTimeout(() => this.resolveHint(null), HINT_TIMEOUT_MS)
      this.hintWaiter = hint => {
        clearTimeout(timer)
        resolve(hint)
      }
    })
  }

  private resolveHint(hint: Hint | null): void {
    const waiter = this.hintWaiter
    this.hintWaiter = null
    waiter?.(hint)
  }

  private receive(msg: CoopServerMsg): void {
    switch (msg.type) {
      case 'snapshot': {
        const { room, you } = msg
        const moved = this.view.room !== null && this.view.room.puzzleId !== room.puzzleId
        if (moved) this.leavePuzzle()
        this.confirmed = decode(room.cells)
        this.pending = this.pending.filter(p => !p.sent)
        for (const p of this.pending) p.sent = this.socket?.send({ type: 'stroke', id: p.id, changes: p.changes }) ?? false
        this.patch({ room: { code: room.code, puzzleId: room.puzzleId, seats: room.seats, you } })
        this.updatePartners()
        return this.settle()
      }
      case 'stroke': {
        for (const { i, to } of msg.changes) this.confirmed[i] = DECODE[to]
        const { id } = msg
        if (msg.by === this.view.room?.you && id !== null) this.pending = this.pending.filter(p => !p.sent || p.id > id)
        // A Clear drops every undo; an undo that empties the whole grid leaves nothing worth undoing either.
        const cleared = id === null && msg.by === 0 && this.confirmed.every(c => c === 'empty')
        if (cleared) this.patch({ hintBy: null })
        return this.settle(cleared)
      }
      case 'cursor':
        return this.setSeats(this.view.room?.seats.map(s => (s.seat === msg.seat ? { ...s, cursor: msg.i } : s)))
      case 'seats':
        return this.setSeats(msg.seats)
      case 'ping':
        return this.addPing(msg.seat, msg.i)
      case 'hint':
        this.patch({ hintBy: msg.by })
        if (this.hintWaiter) return this.resolveHint(msg.hint)
        return this.store?.showHint(msg.hint)
      case 'solved':
        this.solvedMsg = msg
        return this.applySolved(msg)
      case 'moved': {
        const room = this.view.room
        if (!room) return
        this.leavePuzzle()
        this.confirmed = decode(msg.cells)
        return this.patch({ room: { ...room, puzzleId: msg.puzzleId } })
      }
      case 'link': {
        const room = this.view.room
        return room ? this.patch({ room: { ...room, code: msg.code } }) : undefined
      }
      case 'ended':
        return this.patch({ status: 'ended' })
      case 'outdated':
        return
    }
  }

  /** Drops what belonged to the puzzle left; the store for the next one binds afresh. */
  private leavePuzzle(): void {
    this.pending = []
    this.solvedMsg = null
    this.store = null
    this.resolveHint(null)
    this.patch({ hintBy: null })
  }

  private applySolved({ palette, crest, stamps }: Extract<CoopServerMsg, { type: 'solved' }>): void {
    if (!this.store) return
    this.solvedMsg = null
    this.store.setPalette(palette, false, crest, stamps ?? null)
  }

  /** Brings the store's grid to what this player should see. */
  private settle(forgetUndo = false): void {
    const store = this.store
    if (!store) return
    const shown = store.getState().cells
    const want = this.grid()
    const changes = want.flatMap((to, index) => (shown[index] === to ? [] : [{ index, to }]))
    store.applyRemote(changes, { forgetUndo })
  }

  private setSeats(seats: readonly CoopSeat[] | undefined): void {
    const room = this.view.room
    if (!room || !seats) return
    this.patch({ room: { ...room, seats } })
    this.updatePartners()
  }

  private updatePartners(): void {
    const room = this.view.room
    if (!room) return
    const partners = room.seats.flatMap(s =>
      s.seat === room.you || !s.connected || s.cursor === null ? [] : [{ seat: s.seat, index: s.cursor, initial: initialOf(s.name) }],
    )
    this.setPresence({ ...this.presence, partners })
  }

  private addPing(seat: number, index: number): void {
    const t = this.now()
    const name = this.view.room?.seats.find(s => s.seat === seat)?.name ?? ''
    const pings = [...this.presence.pings.filter(p => t - p.at < PING_MS), { seat, index, initial: initialOf(name), at: t }]
    this.setPresence({ ...this.presence, pings })
  }

  private setPresence(presence: Presence): void {
    this.presence = presence
    for (const listener of this.presenceListeners) listener()
  }

  private patch(patch: Partial<CoopView>): void {
    if (Object.entries(patch).every(([k, v]) => this.view[k as keyof CoopView] === v)) return
    this.view = { ...this.view, ...patch }
    for (const listener of this.listeners) listener()
  }
}

export const isEnd = (status: CoopStatus): status is CoopEnd =>
  status !== 'connecting' && status !== 'live' && status !== 'reconnecting'
