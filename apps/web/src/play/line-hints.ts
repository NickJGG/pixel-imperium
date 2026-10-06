import { type Cell, completedClues, gridCol, gridRow, lineImpossible } from '@pixel-imperium/nonogram'
import type { PlayPuzzle } from './store.ts'

export interface LineHint {
  /** Per clue: provably completed, for clue fading. */
  done: readonly boolean[]
  impossible: boolean
}

export interface LineHints {
  rows: readonly LineHint[]
  cols: readonly LineHint[]
}

/**
 * Returns a function from cells to per-line hints. Lines whose cells are unchanged since
 * the previous call keep their previous hint object, so memoized clue lines skip re-rendering.
 */
export function createLineHints({ width, height, clues }: PlayPuzzle): (cells: readonly Cell[]) => LineHints {
  const rows = createLines(clues.rows)
  const cols = createLines(clues.cols)
  return cells => ({
    rows: rows(r => gridRow(cells, width, r)),
    cols: cols(c => gridCol(cells, width, height, c)),
  })
}

function createLines(clues: readonly number[][]) {
  const keys: string[] = []
  let hints: LineHint[] = []
  return (lineAt: (i: number) => Cell[]): LineHint[] => {
    let next = hints
    clues.forEach((lineClues, i) => {
      const line = lineAt(i)
      const key = line.join()
      if (keys[i] === key) return
      keys[i] = key
      if (next === hints) next = hints.slice()
      next[i] = { done: completedClues(line, lineClues), impossible: lineImpossible(line, lineClues) }
    })
    hints = next
    return hints
  }
}
