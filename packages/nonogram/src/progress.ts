/**
 * Assist and progress logic over a player's in-progress cells, where `marked` means
 * "known empty" and `empty` means "not yet decided".
 */
import type { Cell } from './grid.ts'
import { lineFeasible, type SolverCell } from './solver.ts'

function toSolverLine(line: readonly Cell[]): SolverCell[] {
  return line.map(c => (c === 'filled' ? 'filled' : c === 'marked' ? 'empty' : 'unknown'))
}

/** Whether `clues` can be placed in `line` given its filled and marked cells. */
export function canFitCluesInRegion(line: readonly Cell[], clues: readonly number[]): boolean {
  return lineFeasible(toSolverLine(line), clues)
}

/** True when no completion of `line` can satisfy `clues`. */
export function lineImpossible(line: readonly Cell[], clues: readonly number[]): boolean {
  return !canFitCluesInRegion(line, clues)
}

/**
 * For each clue, whether the player has provably completed it (for clue fading): some
 * run bounded by marks or edges must be that clue in every valid completion of the line.
 */
export function completedClues(line: readonly Cell[], clues: readonly number[]): boolean[] {
  const result = Array<boolean>(clues.length).fill(false)
  let i = 0
  while (i < line.length) {
    if (line[i] !== 'filled') {
      i++
      continue
    }
    const start = i
    while (i < line.length && line[i] === 'filled') i++
    const length = i - start
    const sealed = (start === 0 || line[start - 1] === 'marked') && (i === line.length || line[i] === 'marked')
    if (!sealed) continue

    // The sealing marks are excluded, so the two sides are independent.
    const left = line.slice(0, Math.max(0, start - 1))
    const right = line.slice(i + 1)
    let match = -1
    for (let j = 0; j < clues.length; j++) {
      if (clues[j] !== length) continue
      if (!canFitCluesInRegion(left, clues.slice(0, j))) continue
      if (!canFitCluesInRegion(right, clues.slice(j + 1))) continue
      if (match !== -1) {
        match = -1
        break
      }
      match = j
    }
    if (match !== -1) result[match] = true
  }
  return result
}

/**
 * Whole-grid progress for display: 100 only once solved, otherwise 1–99 as soon as one
 * cell is filled, so a started puzzle never reads 0% and a full-but-wrong one never 100%.
 */
export function progressPercent(cells: readonly Cell[], filledCount: number, solved: boolean): number {
  if (solved) return 100
  const filled = cells.filter(c => c === 'filled').length
  if (filled === 0) return 0
  return Math.min(Math.max(Math.floor((filled / filledCount) * 100), 1), 99)
}
