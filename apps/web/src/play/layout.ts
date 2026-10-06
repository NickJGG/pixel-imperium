import type { Clues } from '@pixel-imperium/nonogram'

/** Depth of one clue number, in cells; clue panels and the fit below must agree on it. */
export const CLUE_SLOT = 0.8
const CLUE_PADDING = 0.4
const MIN_CELL = 6
const MAX_CELL = 40

/** The largest whole-pixel cell size that fits the grid plus its clue panels in `available`. */
export function fitCellSize(
  available: { width: number; height: number },
  puzzle: { width: number; height: number; clues: Clues },
): number {
  const depth = (lines: number[][]) => Math.max(1, ...lines.map(l => l.length)) * CLUE_SLOT + CLUE_PADDING
  const size = Math.min(
    available.width / (puzzle.width + depth(puzzle.clues.rows)),
    available.height / (puzzle.height + depth(puzzle.clues.cols)),
  )
  return Math.min(Math.max(Math.floor(size), MIN_CELL), MAX_CELL)
}
