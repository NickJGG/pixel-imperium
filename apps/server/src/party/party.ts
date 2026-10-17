/**
 * One Party's seats, Host and optional shared grid, with no sockets or database: the hub in `server.ts` feeds it
 * messages and relays what it returns. Any seat may be the Host's; when the Host leaves, or stays gone past
 * `HOST_GRACE_MS`, it passes to the longest-seated signed-in member. A newcomer may take over a seat whose holder is
 * gone, but never the Host's.
 */
import { PARTY_SEATS, type PartyChange, type PartySeat, type PartyState } from '@pixel-imperium/protocol'
import type { Grid, SavedGrid } from './grid.ts'

export const HOST_GRACE_MS = 2 * 60_000

/** `user:<id>` for an Account, `device:<token>` for a signed-out guest. */
export type Identity = `user:${string}` | `device:${string}`

export interface SeatHolder {
  identity: Identity
  userId: string | null
  name: string
}

export interface SavedSeat extends SeatHolder {
  /** Join order: the lowest is the longest seated. */
  joined: number
}

interface Member extends SavedSeat {
  /** Open sockets: one player may have the site open in two tabs. */
  connections: number
  /** How many of those tabs are on the grid's puzzle page. */
  here: number
  /** When the last connection closed; `null` while connected. */
  goneSince: number | null
}

export interface SavedParty {
  code: string
  previousCodes: string[]
  hostSeat: number
  seats: (SavedSeat | null)[]
  removed: Identity[]
  grid: SavedGrid | null
}

export class Party {
  code: string
  previousCodes: string[]
  hostSeat: number
  grid: Grid | null
  /** When the last connection closed; `null` while anyone is connected. */
  emptySince: number | null
  private seats: (Member | null)[]
  private removed: Set<Identity>
  private joins: number

  constructor(init: Omit<SavedParty, 'grid'> & { grid: Grid | null; now: number }) {
    this.code = init.code
    this.previousCodes = init.previousCodes
    this.hostSeat = init.hostSeat
    this.grid = init.grid
    this.seats = Array.from({ length: PARTY_SEATS }, (_, k) => {
      const saved = init.seats[k]
      return saved ? { ...saved, connections: 0, here: 0, goneSince: init.now } : null
    })
    this.removed = new Set(init.removed)
    this.joins = Math.max(0, ...this.seats.map(s => (s ? s.joined + 1 : 0)))
    this.emptySince = init.now
  }

  static create(init: { code: string; host: SeatHolder & { userId: string }; now: number }) {
    return new Party({
      code: init.code,
      previousCodes: [],
      hostSeat: 0,
      seats: [{ ...init.host, joined: 0 }],
      removed: [],
      grid: null,
      now: init.now,
    })
  }

  get hostName(): string {
    return this.seats[this.hostSeat]!.name
  }

  get hostId(): string {
    return this.seats[this.hostSeat]!.userId!
  }

  get size(): number {
    return this.seats.filter(Boolean).length
  }

  isHost(seat: number): boolean {
    return seat === this.hostSeat
  }

  seatOf(identity: Identity): number {
    return this.seats.findIndex(s => s?.identity === identity)
  }

  isRemoved(identity: Identity): boolean {
    return this.removed.has(identity)
  }

  /** The seat a newcomer would get: an empty one, else one whose holder is gone; `-1` when full. */
  freeSeat(): number {
    const empty = this.seats.indexOf(null)
    return empty >= 0 ? empty : this.seats.findIndex((s, k) => k !== this.hostSeat && s!.connections === 0)
  }

  names(): string[] {
    return this.seats.flatMap(s => (s ? [s.name] : []))
  }

  holder(seat: number): SeatHolder | null {
    const s = this.seats[seat]
    return s ? { identity: s.identity, userId: s.userId, name: s.name } : null
  }

  holders(): SeatHolder[] {
    return this.seats.flatMap((_, k) => this.holder(k) ?? [])
  }

  /** Seats `identity`, keeping one it holds; `-1` when full. Removal, and whom a takeover bumps, is the caller's. */
  take(holder: SeatHolder, now: number): number {
    const held = this.seatOf(holder.identity)
    if (held >= 0) return held
    const seat = this.freeSeat()
    if (seat < 0) return seat
    this.seats[seat] = { ...holder, joined: this.joins++, connections: 0, here: 0, goneSince: now }
    this.grid?.forget(seat)
    return seat
  }

  connect(seat: number): void {
    const s = this.seats[seat]
    if (!s) return
    s.connections++
    s.goneSince = null
    this.emptySince = null
  }

  disconnect(seat: number, now: number): void {
    const s = this.seats[seat]
    if (!s) return
    s.connections = Math.max(0, s.connections - 1)
    if (s.connections === 0) s.goneSince = now
    this.settle(now)
  }

  /** How many of the seat's tabs are on the grid's puzzle page. */
  setHere(seat: number, tabs: number): void {
    const s = this.seats[seat]
    if (!s) return
    s.here = tabs
    if (tabs === 0) this.grid?.unpoint(seat)
  }

  private settle(now: number): void {
    if (this.emptySince === null && this.seats.every(s => !s || s.connections === 0)) this.emptySince = now
  }

  /** Signed-in members other than the Host, longest seated first; with `connected`, only those with a tab open. */
  private successor(connected: boolean): number {
    const [next] = this.seats
      .flatMap((s, seat) => (s && seat !== this.hostSeat && s.userId && (!connected || s.connections > 0) ? [{ seat, joined: s.joined }] : []))
      .sort((a, b) => a.joined - b.joined)
    return next ? next.seat : -1
  }

  /**
   * Frees the seat. A leaving Host passes on to a connected signed-in member if there is one, else to any;
   * `hostless` when there's no signed-in member left to pass to, and the Party should end.
   */
  leave(seat: number, now: number): { host: number | null; hostless: boolean } {
    if (!this.seats[seat]) return { host: null, hostless: false }
    let host: number | null = null
    if (seat === this.hostSeat) {
      const online = this.successor(true)
      const next = online >= 0 ? online : this.successor(false)
      if (next < 0) {
        this.seats[seat] = null
        return { host: null, hostless: true }
      }
      this.hostSeat = host = next
    }
    this.seats[seat] = null
    this.grid?.forget(seat)
    this.settle(now)
    return { host, hostless: false }
  }

  /** Host only, to another signed-in member. */
  makeHost(by: number, seat: number): boolean {
    if (by !== this.hostSeat || seat === by || !this.seats[seat]?.userId) return false
    this.hostSeat = seat
    return true
  }

  /** Passes a Host gone past the grace to the longest-seated connected signed-in member; their seat, or `-1`. */
  passHost(now: number): number {
    const host = this.seats[this.hostSeat]!
    if (host.goneSince === null || now - host.goneSince < HOST_GRACE_MS) return -1
    const next = this.successor(true)
    if (next >= 0) this.hostSeat = next
    return next
  }

  /** Host only: the removed member's seat frees up and they can't come back; their strokes stay. */
  remove(by: number, seat: number): SeatHolder | null {
    const holder = this.holder(seat)
    if (by !== this.hostSeat || seat === by || !holder) return null
    this.removed.add(holder.identity)
    this.seats[seat] = null
    this.grid?.forget(seat)
    return holder
  }

  /** Host only. */
  clear(seat: number): PartyChange[] | null {
    return seat === this.hostSeat && this.grid ? this.grid.clear() : null
  }

  relink(code: string): void {
    this.previousCodes.push(this.code)
    this.code = code
  }

  seatList(): PartySeat[] {
    return this.seats.flatMap((s, seat) => {
      if (!s) return []
      const here = this.grid !== null && s.connections > 0 && s.here > 0
      return [{ seat, name: s.name, account: s.userId !== null, connected: s.connections > 0, here, cursor: here ? this.grid!.cursorOf(seat) : null }]
    })
  }

  state(): PartyState {
    const puzzle = this.grid && { id: this.grid.puzzle.id, title: this.grid.puzzle.title }
    return { code: this.code, host: this.hostSeat, seats: this.seatList(), puzzle }
  }

  /** What survives a restart: no undo history, nobody connected. */
  save(): SavedParty {
    return {
      code: this.code,
      previousCodes: this.previousCodes,
      hostSeat: this.hostSeat,
      seats: this.seats.map(s => s && { identity: s.identity, userId: s.userId, name: s.name, joined: s.joined }),
      removed: [...this.removed],
      grid: this.grid?.save() ?? null,
    }
  }
}
