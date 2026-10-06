import type { Clues } from '@pixel-imperium/nonogram'

/** `GET /api/puzzles` returns `PuzzleSummary[]`. */
export interface PuzzleSummary {
  id: string
  title: string
  width: number
  height: number
}

/** `GET /api/puzzles/:id`. Never includes the solution or palette. */
export interface PuzzleClues extends PuzzleSummary {
  clues: Clues
}

/** `POST /api/puzzles/:id/solve`; `cells` is row-major, marks sent as `'empty'`. */
export interface SolveRequest {
  cells: ('filled' | 'empty')[]
}

/** On success, `palette` is row-major hex colors, `null` for empty cells. */
export type SolveResponse = { solved: true; palette: (string | null)[] } | { solved: false }

export interface ApiError {
  error: string
}
