import { describe, expect, it } from 'vitest'
import { cluesFromSolution, lineClues, satisfiesClues } from './clues.ts'
import { filled, grid } from './test-helpers.ts'

describe('lineClues', () => {
  it.each([
    [[], []],
    [[false, false], []],
    [[true, true, true], [3]],
    [[true, false, true, true, false], [1, 2]],
    [[false, true, true, false, false, true], [2, 1]],
  ])('%j → %j', (input, expected) => {
    expect(lineClues(input)).toEqual(expected)
  })
})

describe('cluesFromSolution', () => {
  it('derives row and column clues for a rectangle', () => {
    const { width, height, filled: f } = filled([
      '##.#',
      '.###',
    ])
    expect(cluesFromSolution(width, height, f)).toEqual({
      rows: [[2, 1], [3]],
      cols: [[1], [2], [1], [2]],
    })
  })
})

describe('satisfiesClues', () => {
  const diagonal = ['#.', '.#']
  const { width, height, filled: f } = filled(diagonal)
  const clues = cluesFromSolution(width, height, f)

  it('accepts the solution', () => {
    expect(satisfiesClues(grid(diagonal), clues)).toBe(true)
  })

  it('accepts an alternate valid solution', () => {
    expect(satisfiesClues(grid(['.#', '#.']), clues)).toBe(true)
  })

  it('treats marks as empty', () => {
    expect(satisfiesClues(grid(['#x', 'x#']), clues)).toBe(true)
  })

  it('rejects a wrong grid', () => {
    expect(satisfiesClues(grid(['##', '..']), clues)).toBe(false)
    expect(satisfiesClues(grid(['..', '..']), clues)).toBe(false)
  })

  it('rejects mismatched dimensions', () => {
    expect(satisfiesClues(grid(['#..', '.#.']), clues)).toBe(false)
    expect(satisfiesClues({ width: 2, height: 2, cells: grid(['#.']).cells }, clues)).toBe(false)
  })
})
