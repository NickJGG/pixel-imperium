import { type Clues, type SolverCell, cluesFromSolution, logicPassCount, propagate, rateDifficulty } from '@pixel-imperium/nonogram'

export interface CheckRequest {
  seq: number
  width: number
  height: number
  filled: boolean[]
}

export interface Checks {
  width: number
  height: number
  /** Whether no other picture fits the drawing's clues. */
  unique: boolean
  /** Row+column sweeps line logic needs, or `null` where it stalls. */
  passes: number | null
  rating: number | null
  /** Cells to hatch: those that can swap for a second solution, else those line logic can't settle. */
  stuck: number[]
}

/** The campaign checks on a drawing. Line logic finishing proves it unique, so only a stall searches. */
export function check(width: number, height: number, filled: readonly boolean[]): Checks {
  const clues = cluesFromSolution(width, height, filled)
  const passes = logicPassCount(clues)
  if (passes !== null) return { width, height, unique: true, passes, rating: rateDifficulty(clues), stuck: [] }
  const other = otherSolution(clues, filled)
  const stuck = other
    ? indicesWhere(other, (c, i) => (c === 'filled') !== filled[i])
    : indicesWhere(propagate(clues, unknowns(width * height)) ?? [], c => c === 'unknown')
  return { width, height, unique: other === null, passes: null, rating: null, stuck }
}

/** A solution of `clues` other than `drawn`, branching against the drawing first so a difference turns up early. */
function otherSolution(clues: Clues, drawn: readonly boolean[]): SolverCell[] | null {
  const search = (grid: readonly SolverCell[]): SolverCell[] | null => {
    const g = propagate(clues, grid)
    if (!g) return null
    const i = g.indexOf('unknown')
    if (i === -1) return g.some((c, j) => (c === 'filled') !== drawn[j]) ? g : null
    for (const value of drawn[i] ? (['empty', 'filled'] as const) : (['filled', 'empty'] as const)) {
      const next = g.slice()
      next[i] = value
      const found = search(next)
      if (found) return found
    }
    return null
  }
  return search(unknowns(drawn.length))
}

function unknowns(length: number): SolverCell[] {
  return Array<SolverCell>(length).fill('unknown')
}

function indicesWhere<T>(items: readonly T[], test: (item: T, i: number) => boolean): number[] {
  return items.flatMap((item, i) => (test(item, i) ? [i] : []))
}
