/** The gated-step engine: which step a Lesson's grid is on, and what to say about a wrong cell. */
import type { Cell } from '@pixel-imperium/nonogram'
import type { CellRef, Lesson, LessonPuzzle, LessonStep } from './lessons.ts'

const at = (width: number, [r, c]: CellRef) => r * width + c

function satisfied({ target }: LessonStep, cells: readonly Cell[], width: number): boolean {
  if (target === 'solved') return false
  const { filled = [], marked = [] } = target
  return filled.every(ref => cells[at(width, ref)] === 'filled') && marked.every(ref => cells[at(width, ref)] === 'marked')
}

/** The first step whose target isn't met yet; `steps.length` once every gated step is. */
export function currentStep({ steps }: Lesson, cells: readonly Cell[], width: number): number {
  const i = steps.findIndex(step => !satisfied(step, cells, width))
  return i === -1 ? steps.length : i
}

/** Cells the step outlines on the board. */
export function stepCells({ target }: LessonStep, width: number): number[] {
  if (target === 'solved') return []
  return [...(target.filled ?? []), ...(target.marked ?? [])].map(ref => at(width, ref))
}

/** The grid as it would be with every step before `step` done, for resuming mid-Lesson. */
export function cellsBefore({ steps }: Lesson, step: number, width: number, height: number): Cell[] {
  const cells = Array<Cell>(width * height).fill('empty')
  for (const { target } of steps.slice(0, step)) {
    if (target === 'solved') continue
    for (const ref of target.filled ?? []) cells[at(width, ref)] = 'filled'
    for (const ref of target.marked ?? []) cells[at(width, ref)] = 'marked'
  }
  return cells
}

/** A fill the picture leaves empty, or a cross on a cell it fills. */
export const isWrong = ({ palette }: LessonPuzzle, cells: readonly Cell[], i: number): boolean =>
  palette[i] === null ? cells[i] === 'filled' : cells[i] === 'marked'

/**
 * The wrong cell to talk about: one the last edit made wrong, else the one already cited if it's still
 * wrong, else any; `null` when every cell is fine.
 */
export function wrongCell(
  puzzle: LessonPuzzle,
  cells: readonly Cell[],
  before: readonly Cell[],
  cited: number | null,
): number | null {
  const wrong = cells.flatMap((_, i) => (isWrong(puzzle, cells, i) ? [i] : []))
  return wrong.findLast(i => cells[i] !== before[i]) ?? (cited !== null && wrong.includes(cited) ? cited : (wrong[0] ?? null))
}

/** Why the cell at `i` is wrong, citing its clues. Uses the steps' `**bold**` markup. */
export function feedback({ width, clues }: LessonPuzzle, cells: readonly Cell[], i: number): string {
  if (cells[i] === 'marked') {
    return 'That cell is part of the picture, so a cross there will block a clue later. Right-click it again to clear it.'
  }
  const row = Math.floor(i / width)
  const col = i % width
  const show = (clue: number[]) => (clue.length === 0 ? '0' : clue.join(' '))
  return `That cell stays empty. Row ${row + 1} says **${show(clues.rows[row]!)}** and column ${col + 1} says **${show(clues.cols[col]!)}**, and neither has room for it. Click it again to clear it.`
}
