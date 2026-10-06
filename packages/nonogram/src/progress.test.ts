import { describe, expect, it } from 'vitest'
import { canFitCluesInRegion, completedClues, lineImpossible } from './progress.ts'
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
    ['unsealed run', '##......', [2, 1], [false, false]],
    ['sealed but wrong length', 'x###x...', [2, 2], [false, false]],
    ['sealed, only one clue fits by position', 'x##x....', [2, 2], [true, false]],
    ['sealed, either equal clue could be it', '...x##x...', [2, 2], [false, false]],
    ['both equal clues sealed', '##x...x##', [2, 2], [true, true]],
    ['sealed at right edge', '.....x#', [2, 1], [false, true]],
    ['full line', '#####', [5], [true]],
    ['open right edge', 'x###.', [3], [false]],
    ['open left edge', '.###x', [3], [false]],
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
