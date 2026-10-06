import { readFileSync } from 'node:fs'
import { type Clues, cluesFromSolution } from '@pixel-imperium/nonogram'

/**
 * Authored format: `rows` is the picture, `.` = empty and any other char a `palette` key.
 * The solution is every non-`.` cell.
 */
export interface SeedPuzzle {
  id: string
  title: string
  palette: Record<string, string>
  rows: string[]
}

export interface Puzzle {
  id: string
  title: string
  width: number
  height: number
  clues: Clues
  /** Row-major hex colors, `null` for empty cells. */
  palette: (string | null)[]
}

export function parseSeedPuzzle(seed: SeedPuzzle): Puzzle {
  const { id, title, palette, rows } = seed
  const height = rows.length
  const width = rows[0]?.length ?? 0
  if (width === 0) throw new Error(`${id}: empty picture`)

  const colors: (string | null)[] = []
  for (const [r, row] of rows.entries()) {
    if (row.length !== width) throw new Error(`${id}: row ${r} is ${row.length} wide, expected ${width}`)
    for (const ch of row) {
      if (ch === '.') {
        colors.push(null)
        continue
      }
      const color = palette[ch]
      if (!color) throw new Error(`${id}: row ${r} uses '${ch}', which is not in the palette`)
      colors.push(color)
    }
  }

  const clues = cluesFromSolution(width, height, colors.map(c => c !== null))
  return { id, title, width, height, clues, palette: colors }
}

export const SEED_PATH = new URL('../data/puzzles.json', import.meta.url)

export function loadSeedPuzzles(path: URL = SEED_PATH): Puzzle[] {
  const seeds = JSON.parse(readFileSync(path, 'utf8')) as SeedPuzzle[]
  return seeds.map(parseSeedPuzzle)
}
