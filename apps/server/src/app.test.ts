import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { PuzzleClues, PuzzleSummary, SolveResponse } from '@pixel-imperium/protocol'
import { createApp } from './app.ts'
import { solve as solveTable } from './db/schema.ts'
import { parseSeedPuzzle } from './puzzles.ts'
import { createTestDeps, signedInUser, truncateAll } from './test-db.ts'

// A deliberately ambiguous puzzle: the anti-diagonal satisfies the same clues as the stored diagonal.
const diagonal = parseSeedPuzzle({ id: 'diag', title: 'Diagonal', palette: { r: '#f00', b: '#00f' }, rows: ['r.', '.b'] })
const { db, auth } = await createTestDeps()
const app = createApp([diagonal], { db, auth })

beforeEach(() => truncateAll(db))
afterAll(() => db.$client.end())

function solve(cells: unknown, id = 'diag', cookie?: string) {
  return app.request(`/api/puzzles/${id}/solve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
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

describe('solve records', () => {
  const solution = ['filled', 'empty', 'empty', 'filled']
  const rows = () => db.select().from(solveTable)

  it('records a verified solve for a signed-in player', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    expect(await (await solve(solution, 'diag', cookie)).json()).toMatchObject({ solved: true })
    expect(await rows()).toMatchObject([{ userId: id, puzzleId: 'diag', verified: true }])
  })

  it('records nothing when signed out', async () => {
    await signedInUser(db, auth)
    await solve(solution)
    expect(await rows()).toEqual([])
  })

  it('records nothing for a wrong grid', async () => {
    const { cookie } = await signedInUser(db, auth)
    await solve(['filled', 'filled', 'empty', 'empty'], 'diag', cookie)
    expect(await rows()).toEqual([])
  })

  it('upgrades an unverified solve', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await db.insert(solveTable).values({ userId: id, puzzleId: 'diag', verified: false })
    await solve(solution, 'diag', cookie)
    expect(await rows()).toMatchObject([{ userId: id, puzzleId: 'diag', verified: true }])
  })

  it('keeps the first solve time on a repeat solve', async () => {
    const { cookie } = await signedInUser(db, auth)
    await solve(solution, 'diag', cookie)
    const [first] = await rows()
    await solve(solution, 'diag', cookie)
    expect(await rows()).toEqual([first])
  })
})

describe('sign-up handle', () => {
  it('provisions a unique handle from the OAuth name', async () => {
    const { internalAdapter } = await auth.$context
    const oauth = { method: 'oauth', oauth: { providerId: 'google' } }
    const a = await internalAdapter.createUser({ name: 'Pixel Fan', email: 'a@example.com' }, oauth)
    const b = await internalAdapter.createUser({ name: 'PIXEL fan', email: 'b@example.com' }, oauth)
    expect([a.handle, b.handle]).toEqual(['pixel_fan', 'pixel_fan2'])
  })
})
