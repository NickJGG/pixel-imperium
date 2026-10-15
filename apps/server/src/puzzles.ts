import { type Clues, type SeedPuzzle, cluesFromSolution } from '@pixel-imperium/nonogram'

export type { SeedPuzzle }

export interface Puzzle {
  id: string
  title: string
  width: number
  height: number
  clues: Clues
  filledCount: number
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
  const filledCount = colors.filter(c => c !== null).length
  return { id, title, width, height, clues, filledCount, palette: colors }
}
