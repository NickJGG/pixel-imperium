import type { Cell, Grid } from './grid.ts'

const CELL: Record<string, Cell> = { '#': 'filled', x: 'marked', '.': 'empty' }

/** `#` filled, `x` marked, `.` empty. */
export function line(s: string): Cell[] {
  return [...s].map(ch => {
    const cell = CELL[ch]
    if (!cell) throw new Error(`bad cell char ${ch}`)
    return cell
  })
}

export function grid(rows: string[]): Grid {
  return { width: rows[0]!.length, height: rows.length, cells: rows.flatMap(line) }
}

export function filled(rows: string[]): { width: number; height: number; filled: boolean[] } {
  const g = grid(rows)
  return { width: g.width, height: g.height, filled: g.cells.map(c => c === 'filled') }
}
