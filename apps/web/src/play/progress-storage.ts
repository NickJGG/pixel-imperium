import type { Cell } from '@pixel-imperium/nonogram'

const encode: Record<Cell, string> = { empty: '.', filled: '#', marked: 'x' }
const decode: Record<string, Cell> = { '.': 'empty', '#': 'filled', x: 'marked' }

const key = (puzzleId: string) => `pixel-imperium:progress:${puzzleId}`

/** Storage can be missing or throw (private mode, blocked site data); progress is then just not kept. */
export function loadProgress(puzzleId: string, length: number): Cell[] | null {
  let raw: string | null
  try {
    raw = localStorage.getItem(key(puzzleId))
  } catch {
    return null
  }
  if (raw === null || raw.length !== length) return null
  const cells = Array.from(raw, ch => decode[ch])
  return cells.every(c => c !== undefined) ? (cells as Cell[]) : null
}

export function saveProgress(puzzleId: string, cells: readonly Cell[]): void {
  try {
    localStorage.setItem(key(puzzleId), cells.map(c => encode[c]).join(''))
  } catch {}
}

const solvedKey = (puzzleId: string) => `pixel-imperium:solved:${puzzleId}`

/** Lets the library tell a finished grid from one in progress without the puzzle's clues. */
export function loadSolved(puzzleId: string): boolean {
  try {
    return localStorage.getItem(solvedKey(puzzleId)) === '1'
  } catch {
    return false
  }
}

export function saveSolved(puzzleId: string): void {
  try {
    localStorage.setItem(solvedKey(puzzleId), '1')
  } catch {}
}

const paletteKey = (puzzleId: string) => `pixel-imperium:palette:${puzzleId}`

/** The server's reveal colors, kept so the library can draw solved art without re-solving. */
export function loadPalette(puzzleId: string, length: number): (string | null)[] | null {
  let palette: unknown
  try {
    palette = JSON.parse(localStorage.getItem(paletteKey(puzzleId)) ?? 'null')
  } catch {
    return null
  }
  return Array.isArray(palette) &&
    palette.length === length &&
    palette.every(c => c === null || typeof c === 'string')
    ? palette
    : null
}

export function savePalette(puzzleId: string, palette: readonly (string | null)[]): void {
  try {
    localStorage.setItem(paletteKey(puzzleId), JSON.stringify(palette))
  } catch {}
}
