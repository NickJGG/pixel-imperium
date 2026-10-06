import { describe, expect, it } from 'vitest'
import type { PuzzleClues, PuzzleSummary, SolveResponse } from '@pixel-imperium/protocol'
import { createApp } from './app.ts'
import { parseSeedPuzzle } from './puzzles.ts'

// A deliberately ambiguous puzzle: the anti-diagonal satisfies the same clues as the stored diagonal.
const diagonal = parseSeedPuzzle({ id: 'diag', title: 'Diagonal', palette: { r: '#f00', b: '#00f' }, rows: ['r.', '.b'] })
const app = createApp([diagonal])

function solve(cells: unknown, id = 'diag') {
  return app.request(`/api/puzzles/${id}/solve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ cells }),
  })
}

describe('GET /api/puzzles', () => {
  it('lists summaries', async () => {
    const res = await app.request('/api/puzzles')
    expect(await res.json()).toEqual<PuzzleSummary[]>([
      { id: 'diag', title: 'Diagonal', width: 2, height: 2, filledCount: 2 },
    ])
  })
})

describe('GET /api/puzzles/:id', () => {
  it('returns clues without solution or palette', async () => {
    const res = await app.request('/api/puzzles/diag')
    const body = await res.json()
    expect(body).toEqual<PuzzleClues>({
      id: 'diag',
      title: 'Diagonal',
      width: 2,
      height: 2,
      filledCount: 2,
      clues: { rows: [[1], [1]], cols: [[1], [1]] },
    })
    expect(body).not.toHaveProperty('palette')
  })

  it('404s on unknown id', async () => {
    expect((await app.request('/api/puzzles/nope')).status).toBe(404)
  })
})

describe('POST /api/puzzles/:id/solve', () => {
  it('returns the palette for the stored solution', async () => {
    const res = await solve(['filled', 'empty', 'empty', 'filled'])
    expect(await res.json()).toEqual<SolveResponse>({ solved: true, palette: ['#f00', null, null, '#00f'] })
  })

  it('accepts an alternate valid solution', async () => {
    const res = await solve(['empty', 'filled', 'filled', 'empty'])
    expect(await res.json()).toMatchObject({ solved: true })
  })

  it('rejects a wrong grid without leaking the palette', async () => {
    const res = await solve(['filled', 'filled', 'empty', 'empty'])
    expect(await res.json()).toEqual<SolveResponse>({ solved: false })
  })

  it.each([
    ['wrong length', ['filled']],
    ['bad cell value', ['filled', 'marked', 'empty', 'filled']],
    ['not an array', 'filled'],
  ])('400s on %s', async (_, cells) => {
    expect((await solve(cells)).status).toBe(400)
  })

  it('400s on a non-JSON body', async () => {
    const res = await app.request('/api/puzzles/diag/solve', { method: 'POST', body: 'nope' })
    expect(res.status).toBe(400)
  })

  it('404s on unknown id', async () => {
    expect((await solve(['filled'], 'nope')).status).toBe(404)
  })
})
