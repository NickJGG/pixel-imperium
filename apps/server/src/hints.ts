import type { Cell } from '@pixel-imperium/nonogram'
import type { HintResponse } from '@pixel-imperium/protocol'
import type { Puzzle } from './puzzles.ts'

/**
 * One nudge against the authored picture: a random wrong cell (a fill the picture leaves empty, or a
 * mark on one it fills), else a random cell still to fill. `null` when neither is left, which means the
 * grid is solved. A grid on a different valid solution of an ambiguous puzzle reads as wrong.
 */
export function hintFor({ palette }: Pick<Puzzle, 'palette'>, cells: readonly Cell[], random = Math.random): HintResponse | null {
  const pick = (indices: number[]) => indices[Math.floor(random() * indices.length)]!
  const mistakes: number[] = []
  const toFill: number[] = []
  cells.forEach((cell, i) => {
    const filled = palette[i] !== null
    if (filled ? cell === 'marked' : cell === 'filled') mistakes.push(i)
    else if (filled && cell === 'empty') toFill.push(i)
  })
  if (mistakes.length > 0) return { kind: 'mistake', index: pick(mistakes) }
  return toFill.length > 0 ? { kind: 'reveal', index: pick(toFill) } : null
}

/** At most `limit` calls per key in each `windowMs`, counted in fixed windows. */
export function rateLimiter(limit: number, windowMs: number, now = Date.now) {
  const windows = new Map<string, { start: number; count: number }>()
  return (key: string): boolean => {
    const t = now()
    const w = windows.get(key)
    if (!w || t - w.start >= windowMs) {
      if (windows.size > 10_000) windows.clear()
      windows.set(key, { start: t, count: 1 })
      return true
    }
    return ++w.count <= limit
  }
}
