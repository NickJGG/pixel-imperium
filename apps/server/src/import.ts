import { type Cell, satisfiesClues } from '@pixel-imperium/nonogram'
import type { ImportItem, SolveStatus } from '@pixel-imperium/protocol'
import type { Puzzle } from './puzzles.ts'

const decode: Record<string, Cell> = { '.': 'empty', '#': 'filled', x: 'marked' }

/** Decodes a `.#x` grid string, or `null` if it is not exactly `width × height` valid cells. */
export function parseCells(cells: unknown, { width, height }: Pick<Puzzle, 'width' | 'height'>): Cell[] | null {
  if (typeof cells !== 'string' || cells.length !== width * height) return null
  const decoded = Array.from(cells, ch => decode[ch])
  return decoded.every(c => c !== undefined) ? (decoded as Cell[]) : null
}

export interface ImportPlan {
  solve: SolveStatus | null
  progress: { cells: string; replaying: boolean } | null
}

/**
 * How one signed-out puzzle enters an account. A claimed solve is verified when its grid
 * satisfies the clues and unverified when no finished grid is left (cleared for a replay);
 * a claimed solve whose grid fails the clues counts for nothing beyond the grid itself.
 */
export function planImport(puzzle: Puzzle, item: ImportItem): ImportPlan {
  const cells = parseCells(item.cells, puzzle)
  const progress = cells && item.cells ? { cells: item.cells, replaying: item.solved && item.replaying } : null
  if (!item.solved) return { solve: null, progress }
  if (cells && satisfiesClues({ width: puzzle.width, height: puzzle.height, cells }, puzzle.clues)) {
    return { solve: 'verified', progress }
  }
  return { solve: !cells || item.replaying ? 'unverified' : null, progress }
}
