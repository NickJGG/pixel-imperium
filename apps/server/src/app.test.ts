import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { ImportResponse, MyProgress, PuzzleClues, PuzzleSummary, SolveResponse } from '@pixel-imperium/protocol'
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

function send(method: string, path: string, body: unknown, cookie?: string) {
  return app.request(path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  })
}

const getProgress = async (cookie: string) =>
  (await (await app.request('/api/me/progress', { headers: { cookie } })).json()) as MyProgress

const putProgress = (cookie: string, updatedAt: string, cells = '#...', replaying = false) =>
  send('PUT', '/api/me/progress/diag', { cells, replaying, updatedAt }, cookie)

describe('/api/me', () => {
  it.each([
    ['GET', '/api/me/progress'],
    ['PUT', '/api/me/progress/diag'],
    ['PUT', '/api/me/settings'],
    ['POST', '/api/me/import'],
  ])('%s %s 401s without a session', async (method, path) => {
    const res = await app.request(path, { method, body: method === 'GET' ? null : '{}' })
    expect(res.status).toBe(401)
  })

  it('returns solves, grids, palettes for verified solves only, and assists', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await db.insert(solveTable).values([
      { userId: id, puzzleId: 'diag', verified: true },
      { userId: id, puzzleId: 'other', verified: false },
    ])
    await putProgress(cookie, '2026-01-01T00:00:00.000Z', '#..#')
    const assists = { fadeClues: false, impossibleLines: true, autoMarkEmptyLines: true, crosshair: false, lockLine: true }
    expect((await send('PUT', '/api/me/settings', { assists }, cookie)).status).toBe(204)

    expect(await getProgress(cookie)).toEqual<MyProgress>({
      puzzles: {
        diag: {
          solved: 'verified',
          progress: { cells: '#..#', replaying: false, updatedAt: '2026-01-01T00:00:00.000Z' },
          palette: ['#f00', null, null, '#00f'],
        },
        other: { solved: 'unverified', progress: null, palette: null },
      },
      assists,
    })
  })

  it('has no assists until saved, then keeps only the known keys', async () => {
    const { cookie } = await signedInUser(db, auth)
    expect((await getProgress(cookie)).assists).toBeNull()
    const assists = { fadeClues: true, impossibleLines: true, autoMarkEmptyLines: true, crosshair: true, lockLine: false }
    await send('PUT', '/api/me/settings', { assists: { ...assists, theme: 'dark' } }, cookie)
    expect((await getProgress(cookie)).assists).toEqual(assists)
  })

  it('400s on incomplete assists', async () => {
    const { cookie } = await signedInUser(db, auth)
    expect((await send('PUT', '/api/me/settings', { assists: { fadeClues: true } }, cookie)).status).toBe(400)
  })
})

describe('PUT /api/me/progress/:id', () => {
  it('keeps the newest write and ignores older ones', async () => {
    const { cookie } = await signedInUser(db, auth)
    expect(await (await putProgress(cookie, '2026-01-02T00:00:00.000Z', '#...')).json()).toEqual({ applied: true })
    expect(await (await putProgress(cookie, '2026-01-01T00:00:00.000Z', '.#..')).json()).toEqual({ applied: false })
    expect((await getProgress(cookie)).puzzles.diag?.progress?.cells).toBe('#...')
    expect(await (await putProgress(cookie, '2026-01-03T00:00:00.000Z', '..#x', true)).json()).toEqual({
      applied: true,
    })
    expect((await getProgress(cookie)).puzzles.diag?.progress).toEqual({
      cells: '..#x',
      replaying: true,
      updatedAt: '2026-01-03T00:00:00.000Z',
    })
  })

  it('caps a future timestamp at the current time', async () => {
    const { cookie } = await signedInUser(db, auth)
    await putProgress(cookie, '2999-01-01T00:00:00.000Z')
    const saved = (await getProgress(cookie)).puzzles.diag?.progress?.updatedAt
    expect(new Date(saved!).getTime()).toBeLessThanOrEqual(Date.now())
  })

  it.each([
    ['wrong length', { cells: '#..', replaying: false, updatedAt: '2026-01-01T00:00:00.000Z' }],
    ['bad cell', { cells: '#..o', replaying: false, updatedAt: '2026-01-01T00:00:00.000Z' }],
    ['missing replaying', { cells: '#...', updatedAt: '2026-01-01T00:00:00.000Z' }],
    ['bad date', { cells: '#...', replaying: false, updatedAt: 'yesterday' }],
  ])('400s on %s', async (_, body) => {
    const { cookie } = await signedInUser(db, auth)
    expect((await send('PUT', '/api/me/progress/diag', body, cookie)).status).toBe(400)
  })

  it('404s on unknown id', async () => {
    const { cookie } = await signedInUser(db, auth)
    expect((await send('PUT', '/api/me/progress/nope', {}, cookie)).status).toBe(404)
  })
})

describe('POST /api/me/import', () => {
  const importing = async (cookie: string, puzzles: unknown[]) =>
    (await (await send('POST', '/api/me/import', { puzzles }, cookie)).json()) as ImportResponse

  it('reports and records each outcome', async () => {
    const { cookie } = await signedInUser(db, auth)
    const res = await importing(cookie, [
      { id: 'diag', cells: '#xx#', solved: true, replaying: false },
      { id: 'nope', cells: '#', solved: true, replaying: false },
      { bad: true },
    ])
    expect(res).toEqual<ImportResponse>({ results: { diag: 'verified', nope: 'ignored' } })
    expect((await getProgress(cookie)).puzzles).toEqual({
      diag: {
        solved: 'verified',
        progress: expect.objectContaining({ cells: '#xx#', replaying: false }),
        palette: ['#f00', null, null, '#00f'],
      },
    })
  })

  it('never downgrades a verified solve', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await db.insert(solveTable).values({ userId: id, puzzleId: 'diag', verified: true })
    await importing(cookie, [{ id: 'diag', solved: true, replaying: false }])
    expect((await getProgress(cookie)).puzzles.diag?.solved).toBe('verified')
  })

  it('upgrades an unverified solve', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await db.insert(solveTable).values({ userId: id, puzzleId: 'diag', verified: false })
    await importing(cookie, [{ id: 'diag', cells: '.##.', solved: true, replaying: false }])
    expect((await getProgress(cookie)).puzzles.diag?.solved).toBe('verified')
  })

  it("keeps the account's grid over an imported one, but fills in a missing grid", async () => {
    const { cookie } = await signedInUser(db, auth)
    await putProgress(cookie, '2026-01-01T00:00:00.000Z', 'x...')
    await importing(cookie, [{ id: 'diag', cells: '#...', solved: false, replaying: false }])
    expect((await getProgress(cookie)).puzzles.diag?.progress?.cells).toBe('x...')

    const fresh = await signedInUser(db, auth, 'fresh')
    await importing(fresh.cookie, [{ id: 'diag', cells: '#...', solved: false, replaying: false }])
    expect((await getProgress(fresh.cookie)).puzzles.diag?.progress?.cells).toBe('#...')
  })

  it('400s without a puzzles array', async () => {
    const { cookie } = await signedInUser(db, auth)
    expect((await send('POST', '/api/me/import', { puzzles: 'all' }, cookie)).status).toBe(400)
  })
})
