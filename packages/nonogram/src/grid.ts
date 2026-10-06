export type Cell = 'empty' | 'filled' | 'marked'

/** Row-major: the cell at (row, col) is `cells[row * width + col]`. */
export interface Grid {
  width: number
  height: number
  cells: Cell[]
}

/** `rows` has `height` entries, `cols` has `width`; an empty line has `[]`. */
export interface Clues {
  rows: number[][]
  cols: number[][]
}

export function emptyGrid(width: number, height: number): Grid {
  return { width, height, cells: Array<Cell>(width * height).fill('empty') }
}

export function gridRow<T>(cells: readonly T[], width: number, row: number): T[] {
  return cells.slice(row * width, (row + 1) * width)
}

export function gridCol<T>(cells: readonly T[], width: number, height: number, col: number): T[] {
  return Array.from({ length: height }, (_, r) => cells[r * width + col]!)
}
