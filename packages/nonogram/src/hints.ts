import type { Cell } from './grid.ts'

export interface Hint {
  kind: 'mistake' | 'reveal'
  index: number
}

/**
 * One nudge against the authored picture (`palette`, row-major, `null` for empty): a random wrong cell
 * (a fill the picture leaves empty, or a mark on one it fills), else a random cell still to fill. `null`
 * when neither is left, which means the grid is solved. A grid on a different valid solution of an
 * ambiguous puzzle reads as wrong.
 */
export function hintFor(palette: readonly (string | null)[], cells: readonly Cell[], random = Math.random): Hint | null {
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
