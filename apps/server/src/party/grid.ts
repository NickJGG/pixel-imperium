/**
 * A Party's shared grid on one puzzle, with no sockets or database: strokes, undo, cancel, Clear, hints and the solve.
 * It is seeded from, and written back as, the progress of the Host who started it, its `ownerId`, even if the Host
 * passes on meanwhile.
 */
import { type Cell, type Hint, hintFor, satisfiesClues } from '@pixel-imperium/nonogram'
import { PARTY_SEATS, type PartyCell, type PartyChange, type PartyGrid } from '@pixel-imperium/protocol'
import type { Puzzle } from '../puzzles.ts'

export type GridPuzzle = Pick<Puzzle, 'id' | 'title' | 'width' | 'height' | 'clues' | 'palette'>

interface SeatMarks {
  pointer: number | null
  lastEdit: number | null
  /** Their strokes, oldest first; each write is tagged with the serial it stamped on its cell. */
  undo: Stroke[]
  /** The stroke a `joins` piece adds to while it is still the latest in `undo`. */
  open: Stroke | null
}

type Stroke = { i: number; from: PartyCell; serial: number }[]

export interface SavedGrid {
  puzzleId: string
  ownerId: string
  cells: string
  solved: boolean
  replaying: boolean
}

const CELLS = new Set<string>(['.', '#', 'x'])
const DECODE: Record<PartyCell, Cell> = { '.': 'empty', '#': 'filled', x: 'marked' }
const fresh = (): SeatMarks => ({ pointer: null, lastEdit: null, undo: [], open: null })

export class Grid {
  readonly puzzle: GridPuzzle
  readonly ownerId: string
  cells: PartyCell[]
  solved: boolean
  /** The owner had solved this puzzle before, so their grid writes back as a Replay. */
  replaying: boolean
  /** The grid changed since the owner's progress was last written. */
  dirty = false
  private marks: SeatMarks[]
  /** Per cell, the serial of the write that last set it, so an undo can tell whether anyone wrote over it since. */
  private lastWrite: number[]
  private serial = 0

  constructor(init: { puzzle: GridPuzzle; ownerId: string; cells: string; solved?: boolean; replaying: boolean }) {
    this.puzzle = init.puzzle
    this.ownerId = init.ownerId
    this.cells = [...init.cells] as PartyCell[]
    this.solved = init.solved ?? false
    this.replaying = init.replaying
    this.marks = Array.from({ length: PARTY_SEATS }, fresh)
    this.lastWrite = this.cells.map(() => 0)
  }

  get text(): string {
    return this.cells.join('')
  }

  /** A seat changed hands or emptied: its undo and cursor go with its old holder. */
  forget(seat: number): void {
    this.marks[seat] = fresh()
  }

  private inRange(i: unknown): i is number {
    return Number.isInteger(i) && (i as number) >= 0 && (i as number) < this.cells.length
  }

  private write(m: SeatMarks, changes: readonly PartyChange[], joins: boolean): PartyChange[] {
    const serial = ++this.serial
    // Pushed even while empty, so the stroke's later pieces still find it open.
    const joined = joins && m.open !== null && m.undo.at(-1) === m.open
    const undo: Stroke = joined ? m.open! : []
    if (!joined) m.undo.push(undo)
    m.open = undo
    for (const { i, to } of changes) {
      if (this.cells[i] === to) continue
      undo.push({ i, from: this.cells[i]!, serial })
      this.cells[i] = to
      this.lastWrite[i] = serial
      this.dirty = true
    }
    const last = changes.at(-1)
    if (last) m.lastEdit = last.i
    return [...changes]
  }

  /**
   * Applies a stroke, or a piece of one sent mid-drag, in arrival order; `null` for a malformed one, or any stroke on
   * a solved grid. A piece that `joins` adds to the seat's open stroke, so the whole drag stays one undo.
   */
  stroke(seat: number, changes: unknown, joins = false): PartyChange[] | null {
    const m = this.marks[seat]
    if (!m || this.solved || !Array.isArray(changes) || changes.length === 0 || changes.length > this.cells.length) return null
    const valid = changes.every(c => c && typeof c === 'object' && this.inRange(c.i) && CELLS.has(c.to))
    return valid ? this.write(m, changes.map(({ i, to }: PartyChange) => ({ i, to })), joins) : null
  }

  /** Undoes the seat's latest stroke that still has a cell no one wrote over since; what changed, maybe nothing. */
  undo(seat: number): PartyChange[] {
    const m = this.marks[seat]
    if (!m || this.solved) return []
    while (m.undo.length > 0) {
      const changes = this.revert(m, m.undo.pop()!)
      if (changes.length > 0) return changes
    }
    return []
  }

  /** Takes back the seat's stroke still being drawn, as if it never was; what changed, maybe nothing. */
  cancel(seat: number): PartyChange[] {
    const m = this.marks[seat]
    if (!m || this.solved || !m.open || m.undo.at(-1) !== m.open) return []
    m.undo.pop()
    const changes = this.revert(m, m.open)
    m.open = null
    return changes
  }

  private revert(m: SeatMarks, stroke: Stroke): PartyChange[] {
    const serial = ++this.serial
    const changes: PartyChange[] = []
    for (const { i, from, serial: wrote } of stroke.toReversed()) {
      if (this.lastWrite[i] !== wrote) continue
      this.cells[i] = from
      this.lastWrite[i] = serial
      changes.push({ i, to: from })
    }
    if (changes.length > 0) {
      this.dirty = true
      m.lastEdit = changes.at(-1)!.i
    }
    return changes
  }

  /** Empties the grid and forgets every undo. On a solved grid it starts a Replay. The Host's alone, by `Party`. */
  clear(): PartyChange[] {
    const changes = this.cells.flatMap((c, i): PartyChange[] => (c === '.' ? [] : [{ i, to: '.' }]))
    this.cells.fill('.')
    for (const m of this.marks) m.undo = []
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
    const m = this.marks[seat]
    if (!m || !(i === null || this.inRange(i))) return false
    m.pointer = i
    return true
  }

  /** The player's tab left the page or closed: their cursor falls back to their last edit. */
  unpoint(seat: number): void {
    const m = this.marks[seat]
    if (m) m.pointer = null
  }

  inGrid(i: unknown): i is number {
    return this.inRange(i)
  }

  cursorOf(seat: number): number | null {
    const m = this.marks[seat]
    return m ? (m.pointer ?? m.lastEdit) : null
  }

  hint(): Hint | null {
    return this.solved ? null : hintFor(this.puzzle.palette, this.cells.map(c => DECODE[c]))
  }

  view(): PartyGrid {
    return { puzzleId: this.puzzle.id, cells: this.text, solved: this.solved }
  }

  /** What survives a restart: no undo history. */
  save(): SavedGrid {
    return { puzzleId: this.puzzle.id, ownerId: this.ownerId, cells: this.text, solved: this.solved, replaying: this.replaying }
  }
}
