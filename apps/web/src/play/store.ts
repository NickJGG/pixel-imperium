/**
 * Play state for one puzzle, kept outside React so the canvas can redraw without
 * re-rendering. Edits happen in strokes (one drag or one held key = one undo step).
 *
 * A stroke's action is fixed by its first cell: starting on `empty` paints the tool's
 * state onto empty cells; starting on the tool's state erases that state back to
 * empty; starting on the other state does nothing. So marks never overwrite fills
 * and vice versa.
 *
 * Solving locks the grid. Only `clear()` unlocks it, as a replay: the puzzle stays solved
 * in storage, with a replay flag until it is solved again. The first solve settles foil.
 *
 * `cells` in the published state is a new array only when a cell changed, so it can
 * key derived per-line work.
 */
import { type Cell, type Clues, satisfiesClues } from '@pixel-imperium/nonogram'
import type { HintResponse } from '@pixel-imperium/protocol'
import { type ProgressStorage, signedOutStorage } from './progress-storage.ts'

export type Tool = 'fill' | 'mark'

export interface Pos {
  row: number
  col: number
}

export interface PlayPuzzle {
  id: string
  width: number
  height: number
  clues: Clues
}

export interface PlayState {
  cells: readonly Cell[]
  cursor: Pos
  /** Tool for touch/pen input; mouse buttons and keys pick their own. */
  mode: Tool
  /** Cell under a hovering mouse, `null` when not hovering or mid-stroke. */
  hover: Pos | null
  focused: boolean
  canUndo: boolean
  canRedo: boolean
  solved: boolean
  /** A solved puzzle cleared to play again and not yet re-solved. */
  replaying: boolean
  /** Row-major reveal colors from the server, `null` until a confirmed solve. */
  palette: readonly (string | null)[] | null
  /** The hint on show, until the next edit. */
  hint: HintResponse | null
  /** A hint has been used on this puzzle, ever. */
  hinted: boolean
}

interface Change {
  index: number
  from: Cell
  to: Cell
}

interface ActiveStroke {
  /** Cells in state `from` become `to`; `from === null` makes the stroke a no-op. */
  from: Cell | null
  to: Cell
  start: Pos
  last: Pos
  lockAxis: boolean
  /** `row` = moving along the start row, `col` = along the start column. */
  axis: 'row' | 'col' | null
  changes: Change[]
}

const toolState: Record<Tool, Cell> = { fill: 'filled', mark: 'marked' }

/** Marks every empty cell in a line with no clues. */
function autoMark(cells: Cell[], { width, clues }: PlayPuzzle): void {
  cells.forEach((c, i) => {
    if (c !== 'empty') return
    const row = Math.floor(i / width)
    const col = i % width
    if (clues.rows[row]!.length === 0 || clues.cols[col]!.length === 0) cells[i] = 'marked'
  })
}

/** The grid a puzzle opens with when there is no saved progress. */
export function freshCells(puzzle: PlayPuzzle, autoMarkEmptyLines: boolean): Cell[] {
  const cells = Array<Cell>(puzzle.width * puzzle.height).fill('empty')
  if (autoMarkEmptyLines) autoMark(cells, puzzle)
  return cells
}

/** The cell the crosshair assist follows: the hovered cell, else the keyboard cursor while focused. */
export function crosshairOf(state: PlayState): Pos | null {
  if (state.solved) return null
  return state.hover ?? (state.focused ? state.cursor : null)
}

export interface PlayStoreOptions {
  /** Marks lines with no clues as part of the initial, non-undoable state. */
  autoMarkEmptyLines?: boolean
  storage?: ProgressStorage
  /** Called after each edit is persisted. */
  onSave?: (() => void) | undefined
}

export class PlayStore {
  readonly puzzle: PlayPuzzle
  private readonly storage: ProgressStorage
  private readonly onSave: (() => void) | undefined
  private cells: Cell[]
  private undoStack: Change[][] = []
  private redoStack: Change[][] = []
  private stroke: ActiveStroke | null = null
  private cellsChanged = false
  private state: PlayState
  private listeners = new Set<() => void>()

  constructor(puzzle: PlayPuzzle, { autoMarkEmptyLines = false, storage = signedOutStorage, onSave }: PlayStoreOptions = {}) {
    this.puzzle = puzzle
    this.storage = storage
    this.onSave = onSave
    const { id, width, height } = puzzle
    this.cells = storage.loadProgress(id, width * height) ?? Array<Cell>(width * height).fill('empty')
    if (autoMarkEmptyLines) autoMark(this.cells, puzzle)
    const solved = this.checkSolved()
    this.state = {
      cells: this.cells.slice(),
      cursor: { row: 0, col: 0 },
      mode: 'fill',
      hover: null,
      focused: false,
      canUndo: false,
      canRedo: false,
      solved,
      replaying: !solved && storage.loadReplay(id),
      palette: solved ? storage.loadPalette(id, width * height) : null,
      hint: null,
      hinted: storage.loadHinted(id),
    }
  }

  getState = (): PlayState => this.state

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  get strokeActive(): boolean {
    return this.stroke !== null
  }

  beginStroke(pos: Pos, tool: Tool, { lockAxis }: { lockAxis: boolean }): void {
    if (this.state.solved) return
    this.endStroke()
    const target = toolState[tool]
    const first = this.cells[this.index(pos)]
    const from = first === 'empty' ? 'empty' : first === target ? target : null
    this.stroke = {
      from,
      to: first === 'empty' ? target : 'empty',
      start: pos,
      last: pos,
      lockAxis,
      axis: null,
      changes: [],
    }
    this.apply(pos)
    this.emit({ cursor: pos })
  }

  /** Continues the stroke to `pos`, filling in any cells skipped between events, unless it `jump`s there. */
  extendStroke(pos: Pos, jump = false): void {
    const s = this.stroke
    if (!s) return
    let target = this.clamp(pos)
    if (s.lockAxis) {
      if (!s.axis) {
        const dRow = Math.abs(target.row - s.start.row)
        const dCol = Math.abs(target.col - s.start.col)
        if (dRow === 0 && dCol === 0) return
        s.axis = dCol >= dRow ? 'row' : 'col'
      }
      target = s.axis === 'row' ? { row: s.start.row, col: target.col } : { row: target.row, col: s.start.col }
    }
    if (target.row === s.last.row && target.col === s.last.col) return

    if (jump) {
      this.apply(target)
      s.last = target
      return this.emit({ cursor: target })
    }
    let { row, col } = s.last
    const dRow = Math.abs(target.row - row)
    const dCol = Math.abs(target.col - col)
    const stepRow = Math.sign(target.row - row)
    const stepCol = Math.sign(target.col - col)
    let err = dCol - dRow
    while (row !== target.row || col !== target.col) {
      const e2 = 2 * err
      if (e2 > -dRow) {
        err -= dRow
        col += stepCol
      }
      if (e2 < dCol) {
        err += dCol
        row += stepRow
      }
      this.apply({ row, col })
    }
    s.last = target
    this.emit({ cursor: target })
  }

  endStroke(): void {
    const s = this.stroke
    if (!s) return
    this.stroke = null
    if (s.changes.length === 0) return
    this.undoStack.push(s.changes)
    this.redoStack = []
    this.commit()
  }

  /** Drops the stroke as if it never happened: no undo step, nothing saved. */
  cancelStroke(): void {
    const s = this.stroke
    if (!s) return
    this.stroke = null
    if (s.changes.length === 0) return
    for (const c of s.changes.toReversed()) this.cells[c.index] = c.from
    this.cellsChanged = true
    this.emit({})
  }

  undo(): void {
    if (this.state.solved) return
    this.endStroke()
    const changes = this.undoStack.pop()
    if (!changes) return
    for (const c of changes) this.cells[c.index] = c.from
    this.cellsChanged = true
    this.redoStack.push(changes)
    this.commit()
  }

  redo(): void {
    if (this.state.solved) return
    this.endStroke()
    const changes = this.redoStack.pop()
    if (!changes) return
    for (const c of changes) this.cells[c.index] = c.to
    this.cellsChanged = true
    this.undoStack.push(changes)
    this.commit()
  }

  /** Resets to the fresh grid as one undo step; on a solved puzzle this starts a replay. */
  clear({ autoMarkEmptyLines }: { autoMarkEmptyLines: boolean }): void {
    this.endStroke()
    const changes: Change[] = []
    freshCells(this.puzzle, autoMarkEmptyLines).forEach((to, index) => {
      const from = this.cells[index]!
      if (from !== to) changes.push({ index, from, to })
    })
    if (changes.length === 0) return
    for (const c of changes) this.cells[c.index] = c.to
    this.cellsChanged = true
    this.undoStack.push(changes)
    this.redoStack = []
    if (!this.state.solved) return this.commit()
    this.storage.saveReplay(this.puzzle.id)
    this.commit({ replaying: true, palette: null })
  }

  /** `wrap` carries a step off one edge round to the other; a stroke jumps there rather than paint the way across. */
  moveCursor(dRow: number, dCol: number, wrap = false): void {
    const { cursor } = this.state
    const to = { row: cursor.row + dRow, col: cursor.col + dCol }
    const next = wrap ? this.wrap(to) : this.clamp(to)
    if (this.state.hover) this.emit({ hover: null })
    if (this.stroke) this.extendStroke(next, next.row !== to.row || next.col !== to.col)
    else this.emit({ cursor: next })
  }

  setHover(hover: Pos | null): void {
    const prev = this.state.hover
    if (prev === hover || (prev && hover && prev.row === hover.row && prev.col === hover.col)) return
    this.emit({ hover })
  }

  setFocused(focused: boolean): void {
    if (focused !== this.state.focused) this.emit({ focused })
  }

  setMode(mode: Tool): void {
    this.emit({ mode })
  }

  /**
   * Stores the server's reveal colors; for an account, the server recorded the solve as verified
   * and says whether it is foil, which overrides the device's guess.
   */
  setPalette(palette: readonly (string | null)[], foil: boolean | null = null): void {
    this.storage.savePalette(this.puzzle.id, palette)
    if (this.storage.userId !== null) this.storage.saveSolved(this.puzzle.id, 'verified')
    if (foil !== null) this.storage.saveFoil(this.puzzle.id, foil)
    this.emit({ palette })
  }

  showHint(hint: HintResponse): void {
    this.storage.saveHinted(this.puzzle.id)
    this.emit({ hint, hinted: true })
  }

  private apply(pos: Pos): void {
    const s = this.stroke!
    const index = this.index(pos)
    const from = this.cells[index]!
    if (s.from === null || from !== s.from) return
    this.cells[index] = s.to
    this.cellsChanged = true
    s.changes.push({ index, from, to: s.to })
  }

  /** Persists and checks for the win after a completed edit. */
  private commit(patch: Partial<PlayState> = {}): void {
    const { id, width, height } = this.puzzle
    this.storage.saveProgress(id, this.cells)
    const solved = this.checkSolved()
    if (solved) this.storage.clearReplay(id)
    this.onSave?.()
    if (!solved) return this.emit({ hint: null, ...patch, solved: false })
    // A re-solve already has its reveal colors from the first solve.
    this.emit({
      hint: null,
      solved: true,
      replaying: false,
      palette: this.state.palette ?? this.storage.loadPalette(id, width * height),
    })
  }

  private checkSolved(): boolean {
    const { id, width, height, clues } = this.puzzle
    const solved = satisfiesClues({ width, height, cells: this.cells }, clues)
    if (!solved) return false
    const before = this.storage.loadSolved(id)
    if (before === null) {
      this.storage.saveFoil(id, !this.storage.loadHinted(id))
      this.storage.saveSolvedAt(id, new Date().toISOString())
    }
    if (before !== 'verified') this.storage.saveSolved(id, 'local')
    return true
  }

  private emit(patch: Partial<PlayState>): void {
    this.state = {
      ...this.state,
      ...patch,
      cells: this.cellsChanged ? this.cells.slice() : this.state.cells,
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
    }
    this.cellsChanged = false
    for (const listener of this.listeners) listener()
  }

  private index({ row, col }: Pos): number {
    return row * this.puzzle.width + col
  }

  private clamp({ row, col }: Pos): Pos {
    const { width, height } = this.puzzle
    return { row: Math.min(Math.max(row, 0), height - 1), col: Math.min(Math.max(col, 0), width - 1) }
  }

  private wrap({ row, col }: Pos): Pos {
    const { width, height } = this.puzzle
    return { row: (row + height) % height, col: (col + width) % width }
  }
}
