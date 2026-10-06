import { describe, expect, it } from 'vitest'
import { parseSeedPuzzle } from './puzzles.ts'

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
