import { describe, expect, it } from 'vitest'
import type { Cell } from './grid.ts'
import { canFitCluesInRegion, completedClues, lineImpossible, progressPercent } from './progress.ts'
import { line } from './test-helpers.ts'

describe('lineImpossible', () => {
  it.each<[string, number[], boolean]>([
    ['....', [2], false],
    ['....', [], false],
    ['xxxx', [], false],
    ['.#..', [], true],
    ['###.', [2], true],
    ['#.#.#', [1, 1], true],
    ['.x.x.', [2], true],
    ['..x..', [2, 2], false],
    ['..x..', [2, 1, 1], true],
    ['##x##', [2, 2], false],
    ['##x##', [4], true],
    // separate runs that can still merge into one block
    ['#.#..', [3], false],
    ['#..#.', [3], true],
    ['#x#..', [3], true],
    ['.#.#.#.', [5], false],
    // edge clues
    ['x....', [4], false],
    ['x...x', [4], true],
    ['#####', [5], false],
  ])('%s %j → %s', (s, clues, expected) => {
    expect(lineImpossible(line(s), clues)).toBe(expected)
  })
})

describe('canFitCluesInRegion', () => {
  it.each<[string, number[], boolean]>([
    ['', [], true],
    ['', [1], false],
    ['#', [], false],
    ['#.#', [3], true],
    ['#.#', [1, 1], true],
    ['#.#', [2], false],
  ])('%j %j → %s', (s, clues, expected) => {
    expect(canFitCluesInRegion(line(s), clues)).toBe(expected)
  })
})

describe('completedClues', () => {
  it.each<[string, string, number[], boolean[]]>([
    ['sealed by edge and mark', '##x.....', [2, 1], [true, false]],
    ['open end that would overgrow the clue', '##......', [2, 1], [true, false]],
    ['open run that can still grow', '..##......', [3], [false]],
    ['run boxed in by clue lengths', '...#########...', [2, 9, 2], [false, true, false]],
    ['full line without marks', '.##...#########..##.', [2, 9, 2], [true, true, true]],
    ['single cell pinned by neighbors', '..#.###', [1, 3], [true, true]],
    ['impossible line with boxed-in run completes nothing', '.....#########.###..', [2, 9, 2], [false, false, false]],
    ['sealed but wrong length', 'x###x...', [2, 2], [false, false]],
    ['sealed, only one clue fits by position', 'x##x....', [2, 2], [true, false]],
    ['sealed, either equal clue could be it', '...x##x...', [2, 2], [false, false]],
    ['both equal clues sealed', '##x...x##', [2, 2], [true, true]],
    ['sealed at right edge', '.....x#', [2, 1], [false, true]],
    ['full line', '#####', [5], [true]],
    ['open right edge at full length', 'x###.', [3], [true]],
    ['open left edge at full length', '.###x', [3], [true]],
    ['later run identified while earlier runs still merge', '#.#.x##', [3, 2], [false, true]],
    ['more runs than clues, sealed one still placeable', '#.#x.x##', [3, 2], [false, true]],
    ['contradictory line completes nothing', '##x##x##', [2, 2], [false, false]],
    ['no clues', 'x.x', [], []],
    ['no clues with stray fill', '#..', [], []],
    ['nothing filled', 'x..x.', [1, 1], [false, false]],
  ])('%s: %s %j', (_, s, clues, expected) => {
    expect(completedClues(line(s), clues)).toEqual(expected)
  })
})

describe('progressPercent', () => {
  const grid = (filled: number, length = 225) =>
    Array.from({ length }, (_, i): Cell => (i < filled ? 'filled' : i % 2 ? 'marked' : 'empty'))

  it.each<[string, number, number, boolean, number]>([
    ['nothing filled, marks ignored', 0, 100, false, 0],
    ['one cell rounds up to 1', 1, 225, false, 1],
    ['half', 50, 100, false, 50],
    ['exact count but unsolved', 100, 100, false, 99],
    ['overfill', 120, 100, false, 99],
    ['solved', 100, 100, true, 100],
  ])('%s', (_, filled, filledCount, solved, expected) => {
    expect(progressPercent(grid(filled), filledCount, solved)).toBe(expected)
  })
})
