import { describe, expect, it } from 'vitest'
import { parseCells, planImport } from './import.ts'
import { parseSeedPuzzle } from './puzzles.ts'

const diagonal = parseSeedPuzzle({ id: 'diag', title: 'Diagonal', palette: { r: '#f00', b: '#00f' }, rows: ['r.', '.b'] })

describe('parseCells', () => {
  it('decodes a full grid', () => {
    expect(parseCells('#x.#', diagonal)).toEqual(['filled', 'marked', 'empty', 'filled'])
  })

  it.each([
    ['wrong length', '#x.'],
    ['bad character', '#o.#'],
    ['not a string', 4],
  ])('rejects %s', (_, cells) => {
    expect(parseCells(cells, diagonal)).toBeNull()
  })
})

describe('planImport', () => {
  it('verifies a solve whose grid satisfies the clues, treating marks as empty', () => {
    expect(planImport(diagonal, { id: 'diag', cells: '#xx#', solved: true, replaying: false })).toEqual({
      solve: 'verified',
      progress: { cells: '#xx#', replaying: false },
    })
  })

  it('keeps a solve with no grid left as unverified', () => {
    expect(planImport(diagonal, { id: 'diag', solved: true, replaying: false })).toEqual({
      solve: 'unverified',
      progress: null,
    })
  })

  it('keeps a solve cleared for a replay as unverified, with the replay grid', () => {
    expect(planImport(diagonal, { id: 'diag', cells: '#...', solved: true, replaying: true })).toEqual({
      solve: 'unverified',
      progress: { cells: '#...', replaying: true },
    })
  })

  it('drops a claimed solve whose grid fails the clues, keeping the grid', () => {
    expect(planImport(diagonal, { id: 'diag', cells: '##..', solved: true, replaying: false })).toEqual({
      solve: null,
      progress: { cells: '##..', replaying: false },
    })
  })

  it('imports an unsolved grid as progress only', () => {
    expect(planImport(diagonal, { id: 'diag', cells: '#...', solved: false, replaying: true })).toEqual({
      solve: null,
      progress: { cells: '#...', replaying: false },
    })
  })

  it('ignores an invalid grid', () => {
    expect(planImport(diagonal, { id: 'diag', cells: '#', solved: false, replaying: false })).toEqual({
      solve: null,
      progress: null,
    })
  })
})
