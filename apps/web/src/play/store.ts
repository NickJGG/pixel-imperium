/**
 * Play state for one puzzle, kept outside React so the canvas can redraw without
 * re-rendering. Edits happen in strokes (one drag or one held key = one undo step).
 *
 * A stroke's action is fixed by its first cell: starting on `empty` paints the tool's
 * state onto empty cells; starting on the tool's state erases that state back to
 * empty; starting on the other state does nothing. So marks never overwrite fills
 * and vice versa.
 *
 * `cells` in the published state is a new array only when a cell changed, so it can
 * key derived per-line work.
 */
import { type Cell, type Clues, satisfiesClues } from '@pixel-imperium/nonogram'
import { loadProgress, saveProgress, saveSolved } from './progress-storage.ts'

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
  /** Row-major reveal colors from the server, `null` until a confirmed solve. */
  palette: readonly (string | null)[] | null
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

/** The cell the crosshair assist follows: the hovered cell, else the keyboard cursor while focused. */
export function crosshairOf(state: PlayState): Pos | null {
  if (state.solved) return null
  return state.hover ?? (state.focused ? state.cursor : null)
}

export class PlayStore {
  readonly puzzle: PlayPuzzle
  private cells: Cell[]
  private undoStack: Change[][] = []
  private redoStack: Change[][] = []
  private stroke: ActiveStroke | null = null
  private cellsChanged = false
  private state: PlayState
  private listeners = new Set<() => void>()

  /** `autoMarkEmptyLines` marks lines with no clues as part of the initial, non-undoable state. */
  constructor(puzzle: PlayPuzzle, { autoMarkEmptyLines = false } = {}) {
    this.puzzle = puzzle
    const { id, width, height, clues } = puzzle
    this.cells = loadProgress(id, width * height) ?? Array<Cell>(width * height).fill('empty')
    if (autoMarkEmptyLines) {
      this.cells.forEach((c, i) => {
        if (c !== 'empty') return
        const row = Math.floor(i / width)
        const col = i % width
        if (clues.rows[row]!.length === 0 || clues.cols[col]!.length === 0) this.cells[i] = 'marked'
      })
    }
    this.state = {
      cells: this.cells.slice(),
      cursor: { row: 0, col: 0 },
      mode: 'fill',
      hover: null,
      focused: false,
      canUndo: false,
      canRedo: false,
      solved: this.checkSolved(),
      palette: null,
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

  /** Continues the stroke to `pos`, filling in any cells skipped between events. */
  extendStroke(pos: Pos): void {
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

    let { row, col } = s.last
    while (row !== target.row || col !== target.col) {
      row += Math.sign(target.row - row)
      col += Math.sign(target.col - col)
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

  moveCursor(dRow: number, dCol: number): void {
    const { cursor } = this.state
    const next = this.clamp({ row: cursor.row + dRow, col: cursor.col + dCol })
    if (this.state.hover) this.emit({ hover: null })
    if (this.stroke) this.extendStroke(next)
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

  setPalette(palette: readonly (string | null)[]): void {
    this.emit({ palette })
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
  private commit(): void {
    saveProgress(this.puzzle.id, this.cells)
    this.emit({ solved: this.checkSolved() })
  }

  /** Solving locks the grid, so the solved flag is only ever set, never cleared. */
  private checkSolved(): boolean {
    const { id, width, height, clues } = this.puzzle
    const solved = satisfiesClues({ width, height, cells: this.cells }, clues)
    if (solved) saveSolved(id)
    return solved
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
}
