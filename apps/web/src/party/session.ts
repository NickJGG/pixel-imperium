/**
 * One tab's side of the party socket: Friends' presence, invites, the player's Party, and, while this tab is on the
 * Party's puzzle page, its shared grid and the `PlayStore` playing it.
 *
 * The grid: own strokes show at once and wait as pending until the server echoes them; the store always shows the
 * server's grid with the pending strokes on top, so a partner's stroke over the same cells is undone only if the
 * server applied it later. A snapshot (on each arrival at the page) replaces everything; strokes drawn while
 * disconnected go out after it. Off the page the grid is dropped, since the server stops relaying it here.
 */
import type { Cell, Hint } from '@pixel-imperium/nonogram'
import {
  type FriendPresence,
  PARTY_PROTOCOL,
  type PartyCell,
  type PartyChange,
  type PartyClientMsg,
  type PartyEndReason,
  type PartyInvite,
  type PartyRefusal,
  type PartySeat,
  type PartyServerMsg,
  type PartyState,
} from '@pixel-imperium/protocol'
import type { Change, PartyLink, PlayStore } from '../play/store.ts'
import { initialOf } from './seats.ts'
import { type PartyEnd, PartySocket, type PartySocketEnv, type SocketStatus } from './socket.ts'

export type PartyStatus = 'off' | SocketStatus | PartyEnd

/** The Party moved on to a puzzle while this player was away from its page. */
export interface Started {
  puzzleId: string
  title: string
  by: string
}

/** Something that happened to this player's Party, until dismissed. */
export type PartyNotice = { kind: 'host' } | { kind: 'removed' } | { kind: 'ended'; reason: PartyEndReason }

export interface PartyView {
  status: PartyStatus
  party: PartyState | null
  /** This player's seat. */
  you: number | null
  /** The puzzle whose shared grid this tab holds: the Party's, from its snapshot on, while this tab is on its page. */
  grid: string | null
  invites: readonly PartyInvite[]
  /** Online first, then by Handle. */
  friends: readonly FriendPresence[]
  /** Handles whose friend requests came in since this tab opened. */
  friendRequests: readonly string[]
  started: Started | null
  notice: PartyNotice | null
  /** A join by link is on its way and unanswered. */
  joining: boolean
  /** Why the last join by link or invite was turned away. */
  refused: PartyRefusal | null
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

const ENCODE: Record<Cell, PartyCell> = { empty: '.', filled: '#', marked: 'x' }
const DECODE: Record<PartyCell, Cell> = { '.': 'empty', '#': 'filled', x: 'marked' }
const decode = (cells: string): Cell[] => Array.from(cells, ch => DECODE[ch as PartyCell] ?? 'empty')

const byPresence = (a: FriendPresence, b: FriendPresence) =>
  Number(b.online) - Number(a.online) || a.handle.toLowerCase().localeCompare(b.handle.toLowerCase())

interface Pending {
  id: number
  changes: PartyChange[]
  joins: boolean
  sent: boolean
}

export interface PartySessionOptions {
  deviceToken: string
  /** Where the server's `move` takes this tab: the Party's next puzzle's page. */
  onMove?: (puzzleId: string) => void
  now?: () => number
  socket?: PartySocketEnv
}

const INITIAL: PartyView = {
  status: 'off',
  party: null,
  you: null,
  grid: null,
  invites: [],
  friends: [],
  friendRequests: [],
  started: null,
  notice: null,
  joining: false,
  refused: null,
  hintBy: null,
}

export class PartySession implements PartyLink {
  private view: PartyView = INITIAL
  private presence: Presence = { partners: [], pings: [] }
  private readonly listeners = new Set<() => void>()
  private readonly presenceListeners = new Set<() => void>()
  private socket: PartySocket | null = null
  /** The server has answered this connection's `hello`. */
  private greeted = false
  /** Asked for while not live; sent once the server has answered the next `hello`. */
  private outbox: PartyClientMsg[] = []
  /** The join sent on this connection and not yet answered. */
  private joinSent: PartyClientMsg | null = null
  /** The puzzle page this tab is on. */
  private here: string | null = null
  private confirmed: Cell[] = []
  private pending: Pending[] = []
  /** The pieces of the stroke being drawn. */
  private drawing: Pending[] = []
  private strokeId = 0
  private store: PlayStore | null = null
  /** A `solved` that came before the store did. */
  private solvedMsg: Extract<PartyServerMsg, { type: 'solved' }> | null = null
  private hintWaiter: ((hint: Hint | null) => void) | null = null
  private readonly now: () => number

  constructor(private readonly options: PartySessionOptions) {
    this.now = options.now ?? (() => performance.now())
  }

  getState = (): PartyView => this.view

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getPresence = (): Presence => this.presence

  subscribePresence = (listener: () => void): (() => void) => {
    this.presenceListeners.add(listener)
    return () => this.presenceListeners.delete(listener)
  }

  get running(): boolean {
    return this.socket !== null
  }

  start(): void {
    if (this.socket) return
    this.socket = new PartySocket(
      {
        hello: () => ({ type: 'hello', protocol: PARTY_PROTOCOL, deviceToken: this.options.deviceToken }),
        onMessage: msg => this.receive(msg),
        onStatus: status => {
          if (status !== 'live') this.dropped()
          this.patch({ status })
        },
        onEnd: status => {
          this.socket = null
          this.dropped()
          this.outbox = []
          this.patch({ status, joining: false })
        },
      },
      this.options.socket,
    )
  }

  /** Closes the socket and forgets everything it brought, as when the player signs in or out. */
  stop(): void {
    this.socket?.close()
    this.socket = null
    this.greeted = false
    this.joinSent = null
    this.outbox = []
    this.dropGrid()
    this.view = INITIAL
    this.setPresence({ partners: [], pings: [] })
    for (const listener of this.listeners) listener()
  }

  /** The puzzle page this tab is on, or `null` off any; the router tells it on every navigation. */
  setHere(puzzleId: string | null): void {
    if (puzzleId === this.here) return
    this.here = puzzleId
    if (this.view.grid !== null && puzzleId !== this.view.grid) this.dropGrid()
    if (puzzleId !== null && this.view.started?.puzzleId === puzzleId) this.patch({ started: null })
    this.socket?.send({ type: 'here', puzzleId })
  }

  /** By link; the server answers with the Party, or `refused`. */
  join(code: string, started = false): void {
    this.patch({ refused: null, joining: true })
    this.control({ type: 'join', code, ...(started && { started: true }) })
  }

  /** Signed in and in no Party: starts one with no puzzle yet. */
  startParty(): void {
    this.control({ type: 'start' })
  }

  /** The Host's (or, in no Party, a signed-in player's, which starts one): the Party solves this puzzle next. */
  play(puzzleId: string): void {
    this.control({ type: 'play', puzzleId })
  }

  invite(handle: string): void {
    this.control({ type: 'invite', handle })
  }

  respond(inviteId: string, accept: boolean): void {
    this.patch({ invites: this.view.invites.filter(i => i.id !== inviteId), ...(accept && { refused: null }) })
    this.control({ type: 'respond', inviteId, accept })
  }

  leave(): void {
    this.control({ type: 'leave' })
  }

  /** Host only, as are the rest. */
  makeHost(seat: number): void {
    this.control({ type: 'makeHost', seat })
  }

  remove(seat: number): void {
    this.control({ type: 'remove', seat })
  }

  newLink(): void {
    this.control({ type: 'newLink' })
  }

  end(): void {
    this.control({ type: 'end' })
  }

  dismissStarted(): void {
    this.patch({ started: null })
  }

  dismissNotice(): void {
    this.patch({ notice: null })
  }

  private control(msg: PartyClientMsg): void {
    if (!this.greeted || !this.socket?.send(msg)) return void this.outbox.push(msg)
    if (msg.type === 'join') this.joinSent = msg
  }

  /** The connection went: the next one must say where this tab is again, and ask again for an unanswered join. */
  private dropped(): void {
    this.greeted = false
    if (this.joinSent) this.outbox.unshift(this.joinSent)
    this.joinSent = null
  }

  /** The grid as this player sees it: the server's, with their pending strokes on top. */
  grid(): Cell[] {
    const cells = this.confirmed.slice()
    for (const p of this.pending) for (const { i, to } of p.changes) cells[i] = DECODE[to]
    return cells
  }

  /** Plays the Party's grid on `store` until the returned unbind; its pointer goes out as this player's cursor. */
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

  stroke(changes: readonly Change[], joins: boolean): void {
    const p: Pending = { id: ++this.strokeId, changes: changes.map(c => ({ i: c.index, to: ENCODE[c.to] })), joins, sent: false }
    this.pending.push(p)
    this.drawing = joins ? [...this.drawing, p] : [p]
    p.sent = this.send(p)
  }

  cancel(): void {
    const drawn = this.drawing
    this.drawing = []
    this.pending = this.pending.filter(p => p.sent || !drawn.includes(p))
    if (drawn.some(p => p.sent)) this.socket?.send({ type: 'cancel' })
  }

  private send(p: Pending): boolean {
    return this.socket?.send({ type: 'stroke', id: p.id, changes: p.changes, ...(p.joins && { joins: true }) }) ?? false
  }

  undo(): void {
    this.socket?.send({ type: 'undo' })
  }

  clear(): void {
    this.socket?.send({ type: 'clear' })
  }

  ping(index: number): void {
    if (!this.socket?.send({ type: 'ping', i: index })) return
    const { you } = this.view
    if (you !== null) this.addPing(you, index)
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

  private receive(msg: PartyServerMsg): void {
    switch (msg.type) {
      case 'party': {
        const { party, you } = msg
        const puzzleId = party?.puzzle?.id ?? null
        if (this.view.grid !== null && puzzleId !== this.view.grid) this.dropGrid()
        const started = this.view.started?.puzzleId === puzzleId ? this.view.started : null
        const answered = this.joinSent !== null
        this.joinSent = null
        this.patch({ party, you, started, ...(answered && { joining: false }) })
        this.updatePartners()
        if (!this.greeted) this.greet()
        return
      }
      case 'seats':
        return this.setParty(party => ({ ...party, seats: msg.seats }))
      case 'host':
        if (msg.seat === this.view.you && msg.seat !== this.view.party?.host) this.patch({ notice: { kind: 'host' } })
        return this.setParty(party => ({ ...party, host: msg.seat }))
      case 'link':
        return this.setParty(party => ({ ...party, code: msg.code }))
      case 'started':
        if (msg.puzzleId === this.here) return
        return this.patch({ started: { puzzleId: msg.puzzleId, title: msg.title, by: msg.by } })
      case 'move':
        this.dropGrid()
        this.here = msg.puzzleId
        this.patch({ started: null })
        return this.options.onMove?.(msg.puzzleId)
      case 'refused':
        this.joinSent = null
        return this.patch({ refused: msg.reason, joining: false })
      case 'removed':
        return this.patch({ notice: { kind: 'removed' } })
      case 'ended':
        this.dropGrid()
        this.patch({ party: null, you: null, started: null, notice: { kind: 'ended', reason: msg.reason } })
        return this.updatePartners()
      case 'invite':
        return this.patch({ invites: [...this.view.invites.filter(i => i.id !== msg.invite.id), msg.invite] })
      case 'uninvite':
        return this.patch({ invites: this.view.invites.filter(i => i.id !== msg.id) })
      case 'presence': {
        const changed = new Map(msg.friends.map(f => [f.handle, f]))
        const kept = msg.full ? [] : this.view.friends.filter(f => !changed.has(f.handle))
        return this.patch({ friends: [...kept, ...msg.friends].sort(byPresence) })
      }
      case 'friendRequest':
        if (this.view.friendRequests.includes(msg.from)) return
        return this.patch({ friendRequests: [...this.view.friendRequests, msg.from] })
      case 'snapshot': {
        const { grid } = msg
        if (grid.puzzleId !== this.here) return
        if (grid.puzzleId !== this.view.grid) this.leavePuzzle()
        this.confirmed = decode(grid.cells)
        this.pending = this.pending.filter(p => !p.sent)
        for (const p of this.pending) p.sent = this.send(p)
        this.patch({ grid: grid.puzzleId })
        return this.settle()
      }
      case 'stroke': {
        if (this.view.grid === null) return
        for (const { i, to } of msg.changes) this.confirmed[i] = DECODE[to]
        const { id } = msg
        if (msg.by === this.view.you && id !== null) this.pending = this.pending.filter(p => !p.sent || p.id > id)
        // A Clear drops every undo; an undo of the Host's that empties the whole grid leaves nothing worth undoing either.
        const cleared = id === null && msg.by === this.view.party?.host && this.confirmed.every(c => c === 'empty')
        if (cleared) this.patch({ hintBy: null })
        return this.settle(cleared)
      }
      case 'cursor':
        return this.setParty(party => ({ ...party, seats: party.seats.map(s => (s.seat === msg.seat ? { ...s, cursor: msg.i } : s)) }))
      case 'ping':
        return this.addPing(msg.seat, msg.i)
      case 'hint':
        if (this.view.grid === null) return
        this.patch({ hintBy: msg.by })
        if (this.hintWaiter) return this.resolveHint(msg.hint)
        return this.store?.showHint(msg.hint)
      case 'solved':
        if (this.view.grid === null) return
        this.solvedMsg = msg
        // The server took no more of a drag once it solved the grid, so what was drawn past that goes.
        this.pending = []
        this.drawing = []
        this.store?.releaseStroke()
        this.settle()
        return this.applySolved(msg)
      case 'outdated':
        return
    }
  }

  /** The server has answered `hello`: it knows nothing of this tab yet, so where it is and what waited go now. */
  private greet(): void {
    this.greeted = true
    if (this.here !== null) this.socket?.send({ type: 'here', puzzleId: this.here })
    const outbox = this.outbox
    this.outbox = []
    for (const msg of outbox) this.control(msg)
  }

  private dropGrid(): void {
    this.leavePuzzle()
    this.confirmed = []
    this.patch({ grid: null })
  }

  /** Drops what belonged to the puzzle left; the store for the next one binds afresh. */
  private leavePuzzle(): void {
    this.pending = []
    this.drawing = []
    this.solvedMsg = null
    this.store = null
    this.resolveHint(null)
    this.patch({ hintBy: null })
  }

  private applySolved({ palette, crest, stamps }: Extract<PartyServerMsg, { type: 'solved' }>): void {
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

  private setParty(change: (party: PartyState) => PartyState): void {
    const { party } = this.view
    if (!party) return
    this.patch({ party: change(party) })
    this.updatePartners()
  }

  private updatePartners(): void {
    const { party, you } = this.view
    const partners = (party?.seats ?? []).flatMap((s: PartySeat) =>
      s.seat === you || !s.connected || !s.here || s.cursor === null ? [] : [{ seat: s.seat, index: s.cursor, initial: initialOf(s.name) }],
    )
    if (partners.length === 0 && this.presence.partners.length === 0) return
    this.setPresence({ ...this.presence, partners })
  }

  private addPing(seat: number, index: number): void {
    const t = this.now()
    const name = this.view.party?.seats.find(s => s.seat === seat)?.name ?? ''
    const pings = [...this.presence.pings.filter(p => t - p.at < PING_MS), { seat, index, initial: initialOf(name), at: t }]
    this.setPresence({ ...this.presence, pings })
  }

  private setPresence(presence: Presence): void {
    this.presence = presence
    for (const listener of this.presenceListeners) listener()
  }

  private patch(patch: Partial<PartyView>): void {
    if (Object.entries(patch).every(([k, v]) => this.view[k as keyof PartyView] === v)) return
    this.view = { ...this.view, ...patch }
    for (const listener of this.listeners) listener()
  }
}
