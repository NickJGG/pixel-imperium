import { type Clues, type Grid, gridCol, gridRow } from './grid.ts'

export function lineClues(line: readonly boolean[]): number[] {
  const clues: number[] = []
  let count = 0
  for (const filled of line) {
    if (filled) count++
    else if (count > 0) {
      clues.push(count)
      count = 0
    }
  }
  if (count > 0) clues.push(count)
  return clues
}

/** `filled` is row-major, `width * height` long. */
export function cluesFromSolution(width: number, height: number, filled: readonly boolean[]): Clues {
  return {
    rows: Array.from({ length: height }, (_, r) => lineClues(gridRow(filled, width, r))),
    cols: Array.from({ length: width }, (_, c) => lineClues(gridCol(filled, width, height, c))),
  }
}

/** The win check: any grid whose filled cells produce exactly these clues wins. Marks count as empty. */
export function satisfiesClues(grid: Grid, clues: Clues): boolean {
  const { width, height, cells } = grid
  if (cells.length !== width * height || clues.rows.length !== height || clues.cols.length !== width) {
    return false
  }
  const filled = cells.map(c => c === 'filled')
  const actual = cluesFromSolution(width, height, filled)
  return linesEqual(actual.rows, clues.rows) && linesEqual(actual.cols, clues.cols)
}

function linesEqual(a: number[][], b: number[][]): boolean {
  return a.every((line, i) => {
    const other = b[i]!
    return line.length === other.length && line.every((n, j) => n === other[j])
  })
}
