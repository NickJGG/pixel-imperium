import { describe, expect, it } from 'vitest'
import { cluesFromSolution } from './clues.ts'
import { mulberry32 } from './random.ts'
import {
  type SolverCell,
  isLogicSolvable,
  isUnique,
  lineFeasible,
  linePlacements,
  lineSolve,
  propagate,
  rateDifficulty,
} from './solver.ts'
import { filled } from './test-helpers.ts'

const U: SolverCell = 'unknown'
const F: SolverCell = 'filled'
const E: SolverCell = 'empty'

function cluesOf(rows: string[]) {
  const { width, height, filled: f } = filled(rows)
  return cluesFromSolution(width, height, f)
}

const heart = [
  '.#.#.',
  '#####',
  '#####',
  '.###.',
  '..#..',
]

const arrow = [
  '..#....',
  '.###...',
  '#####..',
  '..#####',
  '..#....',
]

describe('linePlacements', () => {
  it('enumerates every placement on an open line', () => {
    expect(linePlacements([U, U, U, U, U], [2, 1])).toEqual([
      [true, true, false, true, false],
      [true, true, false, false, true],
      [false, true, true, false, true],
    ])
  })

  it('respects known cells', () => {
    expect(linePlacements([U, E, U, U, F], [2, 1])).toEqual([])
    expect(linePlacements([U, U, E, U, F], [2, 1])).toEqual([[true, true, false, false, true]])
  })

  it('yields the single all-empty placement for no clues', () => {
    expect(linePlacements([U, U], [])).toEqual([[false, false]])
    expect(linePlacements([U, F], [])).toEqual([])
  })
})

describe('lineSolve', () => {
  it('fills the overlap of a long clue', () => {
    expect(lineSolve([U, U, U, U, U], [4])).toEqual([U, F, F, F, U])
  })

  it('returns null on contradiction', () => {
    expect(lineSolve([F, F, F], [1])).toBeNull()
  })
})

describe('lineFeasible', () => {
  it('agrees with placement enumeration on random lines', () => {
    const rng = mulberry32(42)
    const states: SolverCell[] = [U, U, F, E]
    for (let trial = 0; trial < 2000; trial++) {
      const n = Math.floor(rng() * 10)
      const line = Array.from({ length: n }, () => states[Math.floor(rng() * states.length)]!)
      const clues = Array.from({ length: Math.floor(rng() * 4) }, () => 1 + Math.floor(rng() * 4))
      expect(lineFeasible(line, clues), JSON.stringify({ line, clues })).toBe(
        linePlacements(line, clues).length > 0,
      )
    }
  })

  it('handles long lines without enumerating', () => {
    const line = Array<SolverCell>(50).fill(U)
    expect(lineFeasible(line, Array<number>(20).fill(1))).toBe(true)
    expect(lineFeasible(line, Array<number>(26).fill(1))).toBe(false)
  })
})

describe('propagate', () => {
  it('solves a logic-solvable puzzle to its solution', () => {
    const { filled: f } = filled(heart)
    const solved = propagate(cluesOf(heart), Array<SolverCell>(25).fill(U))
    expect(solved).toEqual(f.map(b => (b ? F : E)))
  })

  it('returns null on contradictory clues', () => {
    expect(propagate({ rows: [[2], [2]], cols: [[1], [1]] }, [U, U, U, U])).toBeNull()
  })
})

describe('isLogicSolvable / isUnique', () => {
  it('square puzzle', () => {
    expect(isLogicSolvable(cluesOf(heart))).toBe(true)
    expect(isUnique(cluesOf(heart))).toBe(true)
  })

  it('rectangular puzzle', () => {
    expect(isLogicSolvable(cluesOf(arrow))).toBe(true)
    expect(isUnique(cluesOf(arrow))).toBe(true)
  })

  it('ambiguous 2×2 checkerboard', () => {
    const clues = cluesOf(['#.', '.#'])
    expect(isLogicSolvable(clues)).toBe(false)
    expect(isUnique(clues)).toBe(false)
  })

  it('unsatisfiable clues have no solution', () => {
    expect(isUnique({ rows: [[2], [2]], cols: [[1], [1]] })).toBe(false)
  })
})

describe('rateDifficulty', () => {
  it('rates line-solvable puzzles 1–5', () => {
    for (const p of [heart, arrow]) {
      const rating = rateDifficulty(cluesOf(p))
      expect(rating).toBeGreaterThanOrEqual(1)
      expect(rating).toBeLessThanOrEqual(5)
    }
  })

  it('rates puzzles needing guesswork 5', () => {
    expect(rateDifficulty(cluesOf(['#.', '.#']))).toBe(5)
  })
})
