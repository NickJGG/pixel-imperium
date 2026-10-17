/**
 * One co-op's shared grid and seats, with no sockets or database: the registry in `server.ts` feeds it messages and
 * relays what it returns. Seat 0 is the Host's for the co-op's whole life; guests take seats 1–3, and a newcomer may
 * take over a guest seat whose holder is gone.
 */
import { type Cell, type Hint, hintFor, satisfiesClues } from '@pixel-imperium/nonogram'
import { COOP_SEATS, type CoopCell, type CoopChange, type CoopSeat, type CoopState } from '@pixel-imperium/protocol'
import type { Puzzle } from '../puzzles.ts'

export type RoomPuzzle = Pick<Puzzle, 'id' | 'title' | 'width' | 'height' | 'clues' | 'palette'>

/** `user:<id>` for an Account, `device:<token>` for a signed-out guest. */
export type Identity = `user:${string}` | `device:${string}`

export interface SeatHolder {
  identity: Identity
  userId: string | null
  name: string
}

interface Seat extends SeatHolder {
  /** Open sockets: one player may have the co-op open in two tabs. */
  connections: number
  pointer: number | null
  lastEdit: number | null
  /** Their strokes, oldest first; each write is tagged with the serial it stamped on its cell. */
  undo: Stroke[]
  /** The stroke a `joins` piece adds to while it is still the latest in `undo`. */
  open: Stroke | null
}

type Stroke = { i: number; from: CoopCell; serial: number }[]

export interface SavedRoom {
  code: string
  previousCodes: string[]
  hostId: string
  puzzleId: string
  cells: string
  seats: (SeatHolder | null)[]
  removed: Identity[]
  solved: boolean
  replaying: boolean
}

const CELLS = new Set<string>(['.', '#', 'x'])
const DECODE: Record<CoopCell, Cell> = { '.': 'empty', '#': 'filled', x: 'marked' }

export class Room {
  code: string
  previousCodes: string[]
  readonly hostId: string
  puzzle: RoomPuzzle
  cells: CoopCell[]
  solved: boolean
  /** The Host had solved this puzzle before, so their grid writes back as a Replay. */
  replaying: boolean
  /** The grid changed since the Host's progress was last written. */
  dirty = false
  /** When the last connection closed; `null` while anyone is connected. */
  emptySince: number | null
  private seats: (Seat | null)[]
  private removed: Set<Identity>
  /** Per cell, the serial of the write that last set it, so an undo can tell whether anyone wrote over it since. */
  private lastWrite: number[]
  private serial = 0

  constructor(init: SavedRoom & { puzzle: RoomPuzzle; now: number }) {
    this.code = init.code
    this.previousCodes = init.previousCodes
    this.hostId = init.hostId
    this.puzzle = init.puzzle
    this.cells = [...init.cells] as CoopCell[]
    this.solved = init.solved
    this.replaying = init.replaying
    this.seats = Array.from({ length: COOP_SEATS }, (_, k) => {
      const holder = init.seats[k]
      return holder ? { ...holder, connections: 0, pointer: null, lastEdit: null, undo: [], open: null } : null
    })
    this.removed = new Set(init.removed)
    this.lastWrite = this.cells.map(() => 0)
    this.emptySince = init.now
  }

  static create(init: { code: string; host: SeatHolder & { userId: string }; puzzle: RoomPuzzle; cells: string; replaying: boolean; now: number }) {
    return new Room({
      code: init.code,
      previousCodes: [],
      hostId: init.host.userId,
      puzzleId: init.puzzle.id,
      cells: init.cells,
      seats: [init.host],
      removed: [],
      solved: false,
      replaying: init.replaying,
      puzzle: init.puzzle,
      now: init.now,
    })
  }

  get grid(): string {
    return this.cells.join('')
  }

  get hostName(): string {
    return this.seats[0]!.name
  }

  seatOf(identity: Identity): number {
    return this.seats.findIndex(s => s?.identity === identity)
  }

  isRemoved(identity: Identity): boolean {
    return this.removed.has(identity)
  }

  /** The seat a newcomer would get: an empty one, else one whose guest is gone; `-1` when full. */
  freeSeat(): number {
    const empty = this.seats.findIndex((s, k) => k > 0 && s === null)
    return empty >= 0 ? empty : this.seats.findIndex((s, k) => k > 0 && s!.connections === 0)
  }

  names(): string[] {
    return this.seats.flatMap(s => (s ? [s.name] : []))
  }

  holder(seat: number): SeatHolder | null {
    const s = this.seats[seat]
    return s ? { identity: s.identity, userId: s.userId, name: s.name } : null
  }

  /** Seats `identity`, keeping one it holds; `-1` when the co-op is full. Removal is the caller's to check. */
  take(holder: SeatHolder): number {
    const held = this.seatOf(holder.identity)
    if (held >= 0) return held
    const seat = this.freeSeat()
    if (seat >= 0) this.seats[seat] = { ...holder, connections: 0, pointer: null, lastEdit: null, undo: [], open: null }
    return seat
  }

  connect(seat: number): void {
    this.seats[seat]!.connections++
    this.emptySince = null
  }

  disconnect(seat: number, now: number): void {
    const s = this.seats[seat]
    if (!s) return
    s.connections = Math.max(0, s.connections - 1)
    if (s.connections === 0) s.pointer = null
    if (this.seats.every(s => !s || s.connections === 0)) this.emptySince = now
  }

  private inRange(i: unknown): i is number {
    return Number.isInteger(i) && (i as number) >= 0 && (i as number) < this.cells.length
  }

  private write(seat: Seat, changes: readonly CoopChange[], joins: boolean): CoopChange[] {
    const serial = ++this.serial
    // Pushed even while empty, so the stroke's later pieces still find it open.
    const joined = joins && seat.open !== null && seat.undo.at(-1) === seat.open
    const undo: Stroke = joined ? seat.open! : []
    if (!joined) seat.undo.push(undo)
    seat.open = undo
    for (const { i, to } of changes) {
      if (this.cells[i] === to) continue
      undo.push({ i, from: this.cells[i]!, serial })
      this.cells[i] = to
      this.lastWrite[i] = serial
      this.dirty = true
    }
    const last = changes.at(-1)
    if (last) seat.lastEdit = last.i
    return [...changes]
  }

  /**
   * Applies a stroke, or a piece of one sent mid-drag, in arrival order; `null` for a malformed one, or any stroke on
   * a solved grid. A piece that `joins` adds to the seat's open stroke, so the whole drag stays one undo.
   */
  stroke(seat: number, changes: unknown, joins = false): CoopChange[] | null {
    const s = this.seats[seat]
    if (!s || this.solved || !Array.isArray(changes) || changes.length === 0 || changes.length > this.cells.length) return null
    const valid = changes.every(c => c && typeof c === 'object' && this.inRange(c.i) && CELLS.has(c.to))
    return valid ? this.write(s, changes.map(({ i, to }: CoopChange) => ({ i, to })), joins) : null
  }

  /** Undoes the seat's latest stroke that still has a cell no one wrote over since; what changed, maybe nothing. */
  undo(seat: number): CoopChange[] {
    const s = this.seats[seat]
    if (!s || this.solved) return []
    while (s.undo.length > 0) {
      const changes = this.revert(s, s.undo.pop()!)
      if (changes.length > 0) return changes
    }
    return []
  }

  /** Takes back the seat's stroke still being drawn, as if it never was; what changed, maybe nothing. */
  cancel(seat: number): CoopChange[] {
    const s = this.seats[seat]
    if (!s || this.solved || !s.open || s.undo.at(-1) !== s.open) return []
    s.undo.pop()
    const changes = this.revert(s, s.open)
    s.open = null
    return changes
  }

  private revert(s: Seat, stroke: Stroke): CoopChange[] {
    const serial = ++this.serial
    const changes: CoopChange[] = []
    for (const { i, from, serial: wrote } of stroke.toReversed()) {
      if (this.lastWrite[i] !== wrote) continue
      this.cells[i] = from
      this.lastWrite[i] = serial
      changes.push({ i, to: from })
    }
    if (changes.length > 0) {
      this.dirty = true
      s.lastEdit = changes.at(-1)!.i
    }
    return changes
  }

  /** Host only; empties the grid and forgets every undo. On a solved grid it starts a Replay. */
  clear(seat: number): CoopChange[] | null {
    if (seat !== 0) return null
    const changes = this.cells.flatMap((c, i): CoopChange[] => (c === '.' ? [] : [{ i, to: '.' }]))
    this.cells.fill('.')
    for (const s of this.seats) if (s) s.undo = []
    if (this.solved) {
      this.solved = false
      this.replaying = true
    }
    if (changes.length > 0) this.dirty = true
    return changes
  }

  /** Whether the grid just came to satisfy the clues. */
  checkSolved(): boolean {
    if (this.solved) return false
    const { width, height, clues } = this.puzzle
    this.solved = satisfiesClues({ width, height, cells: this.cells.map(c => DECODE[c]) }, clues)
    return this.solved
  }

  point(seat: number, i: unknown): boolean {
    const s = this.seats[seat]
    if (!s || !(i === null || this.inRange(i))) return false
    s.pointer = i
    return true
  }

  inGrid(i: unknown): i is number {
    return this.inRange(i)
  }

  cursorOf(seat: number): number | null {
    const s = this.seats[seat]
    return s ? (s.pointer ?? s.lastEdit) : null
  }

  hint(): Hint | null {
    return this.solved ? null : hintFor(this.puzzle.palette, this.cells.map(c => DECODE[c]))
  }

  /** Host only: the removed guest's seat frees up and they can't come back; their strokes stay. */
  remove(by: number, seat: number): SeatHolder | null {
    const s = this.seats[seat]
    if (by !== 0 || seat === 0 || !s) return null
    this.removed.add(s.identity)
    this.seats[seat] = null
    return { identity: s.identity, userId: s.userId, name: s.name }
  }

  relink(code: string): void {
    this.previousCodes.push(this.code)
    this.code = code
  }

  /** Next together: everyone stays seated on a new puzzle. */
  move(puzzle: RoomPuzzle, cells: string, replaying: boolean): void {
    this.puzzle = puzzle
    this.cells = [...cells] as CoopCell[]
    this.lastWrite = this.cells.map(() => 0)
    this.solved = false
    this.replaying = replaying
    this.dirty = false
    for (const s of this.seats) {
      if (!s) continue
      s.undo = []
      s.lastEdit = null
      s.pointer = null
    }
  }

  seatList(): CoopSeat[] {
    return this.seats.flatMap((s, seat) =>
      s
        ? [
            {
              seat,
              name: s.name,
              account: s.userId !== null,
              connected: s.connections > 0,
              cursor: s.connections > 0 ? (s.pointer ?? s.lastEdit) : null,
            },
          ]
        : [],
    )
  }

  state(): CoopState {
    return { code: this.code, puzzleId: this.puzzle.id, cells: this.grid, seats: this.seatList(), solved: this.solved }
  }

  /** What survives a restart: no undo history, nobody connected. */
  save(): SavedRoom {
    return {
      code: this.code,
      previousCodes: this.previousCodes,
      hostId: this.hostId,
      puzzleId: this.puzzle.id,
      cells: this.grid,
      seats: this.seats.map((_, k) => this.holder(k)),
      removed: [...this.removed],
      solved: this.solved,
      replaying: this.replaying,
    }
  }
}
