import type { Clues } from '@pixel-imperium/nonogram'

/** Depth of one clue number, in cells; clue panels and the fit below must agree on it. */
export const CLUE_SLOT = 0.8
const CLUE_PADDING = 0.4
const MIN_CELL = 6
const MAX_CELL = 40

/** The side page beside the play card, and the gap between them. */
export const SIDE_PAGE_WIDTH = 280
export const SIDE_PAGE_GAP = 16

interface FitPuzzle {
  width: number
  height: number
  clues: Clues
}

const depth = (lines: number[][]) => Math.max(1, ...lines.map(l => l.length)) * CLUE_SLOT + CLUE_PADDING

/** The largest whole-pixel cell size that fits the grid plus its clue panels in `available`. */
export function fitCellSize(available: { width: number; height: number }, puzzle: FitPuzzle): number {
  const size = Math.min(
    available.width / (puzzle.width + depth(puzzle.clues.rows)),
    available.height / (puzzle.height + depth(puzzle.clues.cols)),
  )
  return Math.min(Math.max(Math.floor(size), MIN_CELL), MAX_CELL)
}

/**
 * The board is sized first, against `available` as if there were no side page; the side page then
 * shows only if the board at that size still fits beside it.
 */
export function fitPlay(
  available: { width: number; height: number },
  puzzle: FitPuzzle,
): { cellSize: number; sidePage: boolean } {
  const cellSize = fitCellSize(available, puzzle)
  const boardWidth = cellSize * (puzzle.width + depth(puzzle.clues.rows))
  return { cellSize, sidePage: boardWidth <= available.width - SIDE_PAGE_WIDTH - SIDE_PAGE_GAP }
}
