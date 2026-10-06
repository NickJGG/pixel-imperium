import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isLogicSolvable, isUnique } from '@pixel-imperium/nonogram'
import { type SeedPuzzle, SEED_PATH, loadSeedPuzzles, parseSeedPuzzle } from './puzzles.ts'

const seeds = JSON.parse(readFileSync(SEED_PATH, 'utf8')) as SeedPuzzle[]

describe('seed puzzles', () => {
  it('have unique ids', () => {
    const ids = seeds.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('include at least one non-square grid', () => {
    expect(loadSeedPuzzles().some(p => p.width !== p.height)).toBe(true)
  })

  describe.each(seeds.map(s => [s.id, s] as const))('%s', (_, seed) => {
    it('is rectangular and uses only palette keys', () => {
      expect(() => parseSeedPuzzle(seed)).not.toThrow()
    })

    it('is unique and logic-solvable', () => {
      const { clues } = parseSeedPuzzle(seed)
      expect(isUnique(clues)).toBe(true)
      expect(isLogicSolvable(clues)).toBe(true)
    })
  })
})

describe('parseSeedPuzzle', () => {
  it('rejects ragged rows', () => {
    expect(() => parseSeedPuzzle({ id: 'x', title: 'X', palette: { a: '#000' }, rows: ['aa', 'a'] })).toThrow(/row 1/)
  })

  it('rejects unknown palette keys', () => {
    expect(() => parseSeedPuzzle({ id: 'x', title: 'X', palette: { a: '#000' }, rows: ['ab'] })).toThrow(/'b'/)
  })

  it('derives clues, the filled count and a row-major palette', () => {
    expect(parseSeedPuzzle({ id: 'x', title: 'X', palette: { a: '#111', b: '#222' }, rows: ['ab.', '..a'] })).toEqual({
      id: 'x',
      title: 'X',
      width: 3,
      height: 2,
      clues: { rows: [[2], [1]], cols: [[1], [1], [1]] },
      filledCount: 3,
      palette: ['#111', '#222', null, null, null, '#111'],
    })
  })
})
