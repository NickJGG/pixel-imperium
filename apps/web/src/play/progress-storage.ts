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
