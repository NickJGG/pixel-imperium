/** The gated-step engine: which step a Lesson's grid is on, and what the lesson's logic says of a placed cell. */
import { type Cell, type SolverCell, lineSolve } from '@pixel-imperium/nonogram'
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

/** The grid with the givens placed and every step before `step` done, for opening or resuming a Lesson. */
export function cellsBefore({ given = {}, steps }: Lesson, step: number, width: number, height: number): Cell[] {
  const cells = Array<Cell>(width * height).fill('empty')
  for (const placed of [given, ...steps.slice(0, step).map(s => s.target)]) {
    if (placed === 'solved') continue
    for (const ref of placed.filled ?? []) cells[at(width, ref)] = 'filled'
    for (const ref of placed.marked ?? []) cells[at(width, ref)] = 'marked'
  }
  return cells
}

/** A fill the picture leaves empty, or a cross on a cell it fills. */
export const isWrong = ({ palette }: LessonPuzzle, cells: readonly Cell[], i: number): boolean =>
  palette[i] === null ? cells[i] === 'filled' : cells[i] === 'marked'

export interface Line {
  axis: 'row' | 'col'
  index: number
}

/**
 * What the lesson's logic says of a placed cell: `ok` when its line proves it within the step, an
 * `aside` when a line proves it but the step is about something else, a `guess` when neither line
 * proves it yet, and `ruled` out when a line forces the opposite.
 */
export type Verdict = { kind: 'ok' } | Flag
export type Flag = { kind: 'guess' } | { kind: 'aside' | 'ruled'; line: Line }

const OK: Verdict = { kind: 'ok' }

/**
 * Judges the cell at `i` by its row and column alone, knowing only the cells that agree with the
 * picture (givens included) and not the cell itself. `stepIndex` is the step the move was made in,
 * so the move that finishes a step is judged by that step. Names the step's own line first.
 */
export function judge(puzzle: LessonPuzzle, { steps }: Lesson, cells: readonly Cell[], i: number, stepIndex: number): Verdict {
  const value = cells[i]
  if (value === 'empty') return OK
  const { width, height, clues } = puzzle
  const known = (j: number): SolverCell =>
    j === i || cells[j] === 'empty' || isWrong(puzzle, cells, j) ? 'unknown' : cells[j] === 'filled' ? 'filled' : 'empty'
  const r = Math.floor(i / width)
  const c = i % width
  const step = steps[Math.min(stepIndex, steps.length - 1)]!
  const { rows = [], cols = [] } = step.highlight
  const forced = (line: SolverCell[], clue: number[], k: number) => lineSolve(line, clue)?.[k] ?? 'unknown'
  const lines = [
    {
      line: { axis: 'row', index: r } as const,
      forced: forced(Array.from({ length: width }, (_, k) => known(r * width + k)), clues.rows[r]!, c),
      focus: rows.includes(r),
    },
    {
      line: { axis: 'col', index: c } as const,
      forced: forced(Array.from({ length: height }, (_, k) => known(k * width + c)), clues.cols[c]!, r),
      focus: cols.includes(c),
    },
  ].sort((a, b) => Number(b.focus) - Number(a.focus))
  const want = value === 'filled' ? 'filled' : 'empty'
  const proof = lines.find(l => l.forced === want)
  if (proof) return step.target === 'solved' || stepCells(step, width).includes(i) ? OK : { kind: 'aside', line: proof.line }
  const against = lines.find(l => l.forced !== 'unknown')
  return against ? { kind: 'ruled', line: against.line } : { kind: 'guess' }
}

/** A cell to talk about, and the step it was placed in. */
export interface Cite {
  cell: number
  step: number
}

/**
 * The cell to talk about after an edit from `before` to `cells`: the newest flagged move, else the
 * one already cited while it's still a guess or ruled out, else any cell ruled out; `null` when none.
 */
export function cite(puzzle: LessonPuzzle, lesson: Lesson, cells: readonly Cell[], before: readonly Cell[], cited: Cite | null): Cite | null {
  const { width } = puzzle
  const step = currentStep(lesson, before, width)
  const newest = cells.findLastIndex((v, i) => v !== before[i] && judge(puzzle, lesson, cells, i, step).kind !== 'ok')
  if (newest !== -1) return { cell: newest, step }
  if (cited && ['guess', 'ruled'].includes(judge(puzzle, lesson, cells, cited.cell, cited.step).kind)) return cited
  const now = currentStep(lesson, cells, width)
  const ruled = cells.findIndex((_, i) => judge(puzzle, lesson, cells, i, now).kind === 'ruled')
  return ruled === -1 ? null : { cell: ruled, step: now }
}

/** What to show for `cited` on the board as it is now: `null` once it's proven, or an aside whose step has passed. */
export function citedFlag(puzzle: LessonPuzzle, lesson: Lesson, cells: readonly Cell[], cited: Cite | null): Flag | null {
  if (cited === null) return null
  const verdict = judge(puzzle, lesson, cells, cited.cell, cited.step)
  if (verdict.kind === 'ok') return null
  if (verdict.kind === 'aside' && cited.step !== currentStep(lesson, cells, puzzle.width)) return null
  return verdict
}

const lineName = ({ axis, index }: Line) => `${axis === 'row' ? 'row' : 'column'} ${index + 1}`
const listed = (word: string, ns: number[]) =>
  ns.length === 1 ? `${word} ${ns[0]! + 1}` : `${word}s ${ns.slice(0, -1).map(n => n + 1).join(', ')} and ${ns.at(-1)! + 1}`
const capital = (s: string) => s[0]!.toUpperCase() + s.slice(1)

/** The coach's note on a flagged cell holding `value`, placed in `step`. Uses the steps' `**bold**` markup. */
export function lessonFeedback({ clues }: LessonPuzzle, step: LessonStep, value: Cell, flag: Flag): string {
  if (flag.kind === 'guess') return 'Nothing on the board proves this cell yet. Clear it and follow the lesson.'
  const { line } = flag
  const clue = (line.axis === 'row' ? clues.rows : clues.cols)[line.index]!
  const says = `${lineName(line)} says **${clue.length === 0 ? '0' : clue.join(' ')}**`
  if (flag.kind === 'aside') {
    const { rows = [], cols = [] } = step.highlight
    const about = [rows.length > 0 && listed('row', rows), cols.length > 0 && listed('column', cols)].filter(Boolean).join(' and ')
    return `True: ${says}, so this cell is ${value === 'filled' ? 'filled' : 'empty'}. Keep it. But this step is about ${about}, so come back to that.`
  }
  return value === 'filled'
    ? `${capital(says)}: with what's on the board, this cell can't be filled. Clear it.`
    : `${capital(says)}: with what's on the board, this cell must be filled. Clear the cross.`
}
