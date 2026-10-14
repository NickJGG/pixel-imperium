import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type {
  Campaign,
  CampaignSummary,
  DailyYear,
  HandleAvailability,
  HintResponse,
  ImportResponse,
  MyProgress,
  Profile,
  PuzzleClues,
  SolveResponse,
  StampId,
} from '@pixel-imperium/protocol'
import { and, eq } from 'drizzle-orm'
import { createApp } from './app.ts'
import {
  account,
  hint as hintTable,
  progress as progressTable,
  session,
  solve as solveTable,
  user,
  userSettings,
} from './db/schema.ts'
import { type CrestDef, buildCampaign } from './campaigns.ts'
import { checkDailies } from './dailies.ts'
import type { SeedPuzzle } from './puzzles.ts'
import { createTestDeps, signedInUser, truncateAll } from './test-db.ts'

// A deliberately ambiguous puzzle: the anti-diagonal satisfies the same clues as the stored diagonal.
const diagonal: SeedPuzzle = { id: 'diag', title: 'Diagonal', palette: { r: '#f00', b: '#00f' }, rows: ['r.', '.b'] }
const dot: SeedPuzzle = { id: 'dot', title: 'Dot', palette: { g: '#0f0' }, rows: ['g'] }

/** A draft campaign, so the fixture can skip the size rules. */
function fixture(id: string, provinces: Record<string, SeedPuzzle[]>, crest?: CrestDef) {
  return buildCampaign({
    campaign: {
      id,
      name: `Campaign ${id}`,
      draft: true,
      paper: 'throne',
      closingLine: 'Done.',
      puzzlesPerProvince: 30,
      provinces: Object.keys(provinces).map(p => ({
        id: p,
        name: `Province ${p}`,
        theme: '',
        flavour: `${p} falls.`,
        paper: 'coast',
        minSize: 5,
        maxSize: 5,
      })),
    },
    provinces,
    ...(crest && { crest }),
  })
}

const { db, auth } = await createTestDeps()
const app = createApp([fixture('main', { first: [diagonal], second: [] })], { db, auth })

beforeEach(() => truncateAll(db))
afterAll(() => db.$client.end())

function solve(cells: unknown, id = 'diag', cookie?: string) {
  return app.request(`/api/puzzles/${id}/solve`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify({ cells }),
  })
}

describe('GET /api/campaigns', () => {
  it('lists campaigns in order, with any release date, their paper and puzzle count', async () => {
    const multi = createApp(
      [{ ...fixture('b', { x: [diagonal], y: [] }), released: '2026-10-05' }, fixture('a', { y: [] })],
      { db, auth },
    )
    expect(await (await multi.request('/api/campaigns')).json()).toEqual<CampaignSummary[]>([
      { id: 'b', name: 'Campaign b', released: '2026-10-05', paper: 'throne', total: 1 },
      { id: 'a', name: 'Campaign a', paper: 'throne', total: 0 },
    ])
  })
})

describe('GET /api/campaigns/:id', () => {
  it('returns the provinces with puzzle summaries, without palettes', async () => {
    const res = await app.request('/api/campaigns/main')
    expect(await res.json()).toEqual<Campaign>({
      id: 'main',
      name: 'Campaign main',
      paper: 'throne',
      closingLine: 'Done.',
      provinces: [
        {
          id: 'first',
          name: 'Province first',
          theme: '',
          flavour: 'first falls.',
          paper: 'coast',
          maxSize: 5,
          puzzles: [{ id: 'diag', title: 'Diagonal', width: 2, height: 2, filledCount: 2 }],
        },
        { id: 'second', name: 'Province second', theme: '', flavour: 'second falls.', paper: 'coast', maxSize: 5, puzzles: [] },
      ],
    })
  })

  it('serves the techniques flag only where set', async () => {
    const base = fixture('t', { x: [], y: [] })
    const flagged = { ...base, provinces: [{ ...base.provinces[0]!, techniques: true as const }, base.provinces[1]!] }
    const { provinces } = (await (await createApp([flagged], { db, auth }).request('/api/campaigns/t')).json()) as Campaign
    expect(provinces.map(p => p.techniques)).toEqual([true, undefined])
  })

  it('serves the release date where set', async () => {
    const dated = createApp([{ ...fixture('d', { x: [] }), released: '2026-10-05' }], { db, auth })
    expect(((await (await dated.request('/api/campaigns/d')).json()) as Campaign).released).toBe('2026-10-05')
  })

  it('404s on unknown id', async () => {
    expect((await app.request('/api/campaigns/nope')).status).toBe(404)
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
      campaignId: 'main',
      provinceId: 'first',
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
    expect(await res.json()).toEqual<SolveResponse>({ solved: true, palette: ['#f00', null, null, '#00f'], foil: null })
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

  it('returns the stamps a signed-in solve earned and brought near', async () => {
    const { cookie } = await signedInUser(db, auth)
    const res = (await (await solve(solution, 'diag', cookie)).json()) as SolveResponse
    expect(res).toMatchObject({
      stamps: {
        earned: ['first-sticker', 'first-foil', 'perfect-page', 'conquered:first'],
        near: [
          { id: 'foil-run', have: 1, need: 5 },
          { id: 'spree', have: 1, need: 10 },
        ],
      },
    })
  })

  it('earns no stamps on a repeat solve', async () => {
    const { cookie } = await signedInUser(db, auth)
    await solve(solution, 'diag', cookie)
    const res = (await (await solve(solution, 'diag', cookie)).json()) as SolveResponse
    expect(res).toMatchObject({ stamps: { earned: [] } })
  })

  describe('best time', () => {
    const timed = (ms: unknown, cookie: string, hinted?: boolean) =>
      app.request('/api/puzzles/diag/solve', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ cells: solution, ms, ...(hinted !== undefined && { hinted }) }),
      })
    const best = async () => (await rows())[0]?.bestMs

    it('only ever moves down', async () => {
      const { cookie } = await signedInUser(db, auth)
      await timed(90_000, cookie)
      expect(await best()).toBe(90_000)
      await timed(120_000, cookie)
      expect(await best()).toBe(90_000)
      await timed(45_000, cookie)
      expect(await best()).toBe(45_000)
    })

    it('is left alone by a hinted solve', async () => {
      const { cookie } = await signedInUser(db, auth)
      await timed(90_000, cookie)
      await timed(10_000, cookie, true)
      expect(await best()).toBe(90_000)
    })

    it.each([['no', undefined], ['a negative', -5], ['a fractional', 1.5], ['a string', '100']])(
      'ignores %s time',
      async (_, ms) => {
        const { cookie } = await signedInUser(db, auth)
        expect(await (await timed(ms, cookie)).json()).toMatchObject({ solved: true })
        expect(await best()).toBeNull()
      },
    )
  })

  it('keeps the first solve time on a repeat solve', async () => {
    const { cookie } = await signedInUser(db, auth)
    await solve(solution, 'diag', cookie)
    const [first] = await rows()
    await solve(solution, 'diag', cookie)
    expect(await rows()).toEqual([first])
  })
})

describe('POST /api/puzzles/:id/hint', () => {
  const hintFor = (cells: unknown, cookie?: string, id = 'diag') =>
    app.request(`/api/puzzles/${id}/hint`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      body: JSON.stringify({ cells }),
    })

  it('points out a wrong cell first, fills or marks alike', async () => {
    expect(await (await hintFor('##..')).json()).toEqual<HintResponse>({ kind: 'mistake', index: 1 })
    expect(await (await hintFor('x...')).json()).toEqual<HintResponse>({ kind: 'mistake', index: 0 })
  })

  it('reveals a cell still to fill when nothing is wrong', async () => {
    expect(await (await hintFor('#x..')).json()).toEqual<HintResponse>({ kind: 'reveal', index: 3 })
  })

  it('409s on a grid with nothing left to hint', async () => {
    expect((await hintFor('#xx#')).status).toBe(409)
  })

  it.each([
    ['wrong length', '#..'],
    ['bad cell', '#..o'],
    ['not a string', ['filled']],
  ])('400s on %s', async (_, cells) => {
    expect((await hintFor(cells)).status).toBe(400)
  })

  it('404s on unknown id', async () => {
    expect((await hintFor('#', undefined, 'nope')).status).toBe(404)
  })

  it('records the hint for a signed-in player only', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await hintFor('....')
    expect(await db.select().from(hintTable)).toEqual([])
    await hintFor('....', cookie)
    await hintFor('#...', cookie)
    expect(await db.select().from(hintTable)).toEqual([{ userId: id, puzzleId: 'diag' }])
    expect((await getProgress(cookie)).puzzles.diag).toMatchObject({ hinted: true })
  })

  it('429s past the rate limit', async () => {
    const limited = createApp([fixture('main', { first: [diagonal] })], { db, auth })
    const statuses = []
    for (let i = 0; i < 61; i++) {
      statuses.push((await limited.request('/api/puzzles/diag/hint', { method: 'POST', body: '{"cells":"...."}' })).status)
    }
    expect(statuses.slice(0, 60).every(s => s === 200)).toBe(true)
    expect(statuses.at(-1)).toBe(429)
  })
})

describe('foil', () => {
  const solution = ['filled', 'empty', 'empty', 'filled']
  const solveFoil = async (cookie: string) => ((await (await solve(solution, 'diag', cookie)).json()) as { foil: boolean }).foil
  const hinting = (cookie: string) => send('POST', '/api/puzzles/diag/hint', { cells: '....' }, cookie)

  it('is foil on a first solve with no hint', async () => {
    const { cookie } = await signedInUser(db, auth)
    expect(await solveFoil(cookie)).toBe(true)
    expect((await getProgress(cookie)).puzzles.diag?.foil).toBe(true)
  })

  it('is regular after a hint', async () => {
    const { cookie } = await signedInUser(db, auth)
    await hinting(cookie)
    expect(await solveFoil(cookie)).toBe(false)
  })

  it('stays as first decided on a re-solve, hint or not', async () => {
    const regular = await signedInUser(db, auth, 'regular')
    await hinting(regular.cookie)
    await solveFoil(regular.cookie)
    expect(await solveFoil(regular.cookie)).toBe(false)

    const shiny = await signedInUser(db, auth, 'shiny')
    await solveFoil(shiny.cookie)
    await hinting(shiny.cookie)
    expect(await solveFoil(shiny.cookie)).toBe(true)
  })

  it('never comes from an import, even once verified', async () => {
    const { cookie } = await signedInUser(db, auth)
    await send('POST', '/api/me/import', { puzzles: [{ id: 'diag', solved: true, replaying: true }] }, cookie)
    expect(await solveFoil(cookie)).toBe(false)

    const fresh = await signedInUser(db, auth, 'fresh')
    await send('POST', '/api/me/import', { puzzles: [{ id: 'diag', cells: '#xx#', solved: true, replaying: false }] }, fresh.cookie)
    expect((await getProgress(fresh.cookie)).puzzles.diag).toMatchObject({ solved: 'verified', foil: false })
  })

  it('is ruled out by a hint used before signing in', async () => {
    const { cookie } = await signedInUser(db, auth)
    await send('POST', '/api/me/import', { puzzles: [{ id: 'diag', cells: '#...', solved: false, replaying: false, hinted: true }] }, cookie)
    expect(await solveFoil(cookie)).toBe(false)
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

describe('crest', () => {
  const crested = createApp(
    [fixture('c', { first: [diagonal], second: [dot] }, { palette: { k: '#123456', j: '#abcdef' }, rows: ['kj'], regions: ['21'] })],
    { db, auth },
  )
  const solution = ['filled', 'empty', 'empty', 'filled']

  it("serves its size and each puzzle's pixel, never a colour", async () => {
    const body = await (await crested.request('/api/campaigns/c')).text()
    const campaign = JSON.parse(body) as Campaign
    expect(campaign.crest).toEqual({ width: 2, height: 1 })
    expect(campaign.provinces.map(p => p.puzzles.map(z => z.crest))).toEqual([[1], [0]])
    expect(body).not.toMatch(/#123456|#abcdef/)
  })

  it("releases a pixel's colour with a solve", async () => {
    const res = await crested.request('/api/puzzles/diag/solve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ cells: solution }),
    })
    expect(await res.json()).toMatchObject({ solved: true, crest: '#abcdef' })
  })

  it('syncs colours for verified solves only', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await db.insert(solveTable).values([
      { userId: id, puzzleId: 'diag', verified: true },
      { userId: id, puzzleId: 'dot', verified: false },
    ])
    const { puzzles } = (await (await crested.request('/api/me/progress', { headers: { cookie } })).json()) as MyProgress
    expect([puzzles.diag?.crest, puzzles.dot?.crest]).toEqual(['#abcdef', null])
  })
})

describe('/api/me', () => {
  it.each([
    ['GET', '/api/me/progress'],
    ['PUT', '/api/me/progress/diag'],
    ['PUT', '/api/me/settings'],
    ['POST', '/api/me/import'],
    ['PUT', '/api/me/handle'],
    ['PUT', '/api/me/showcase'],
    ['PUT', '/api/me/tutorial'],
    ['PUT', '/api/me/techniques'],
    ['PUT', '/api/me/lessons/tutorial:overlap'],
  ])('%s %s 401s without a session', async (method, path) => {
    const res = await app.request(path, { method, body: method === 'GET' ? null : '{}' })
    expect(res.status).toBe(401)
  })

  it('returns solves, grids, palettes and solve dates for verified solves only, and assists', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await db.insert(solveTable).values([
      { userId: id, puzzleId: 'diag', verified: true, solvedAt: new Date('2026-01-03T00:00:00.000Z') },
      { userId: id, puzzleId: 'other', verified: false },
    ])
    await putProgress(cookie, '2026-01-01T00:00:00.000Z', '#..#')
    const assists = { fadeClues: false, impossibleLines: true, autoMarkEmptyLines: true, crosshair: false, lockLine: true }
    expect((await send('PUT', '/api/me/settings', { assists }, cookie)).status).toBe(204)

    expect(await getProgress(cookie)).toEqual<MyProgress>({
      puzzles: {
        diag: {
          solved: 'verified',
          progress: {
            cells: '#..#',
            replaying: false,
            updatedAt: '2026-01-01T00:00:00.000Z',
            elapsedMs: 0,
            attemptHinted: false,
          },
          palette: ['#f00', null, null, '#00f'],
          crest: null,
          foil: false,
          hinted: false,
          solvedAt: '2026-01-03T00:00:00.000Z',
          bestMs: null,
        },
        other: {
          solved: 'unverified',
          progress: null,
          palette: null,
          crest: null,
          foil: false,
          hinted: false,
          solvedAt: null,
          bestMs: null,
        },
      },
      assists,
      showcase: [],
      tutorialAskedAt: null,
      techniquesAskedAt: null,
      lessonsDone: [],
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

describe.each([
  ['tutorial', 'tutorialAskedAt', 'techniquesAskedAt'],
  ['techniques', 'techniquesAskedAt', 'tutorialAskedAt'],
] as const)('PUT /api/me/%s', (offer, field, other) => {
  it('records when it was first offered and keeps that time', async () => {
    const { cookie } = await signedInUser(db, auth)
    const before = Date.now()
    expect((await send('PUT', `/api/me/${offer}`, null, cookie)).status).toBe(204)
    const askedAt = (await getProgress(cookie))[field]
    expect(new Date(askedAt!).getTime()).toBeGreaterThanOrEqual(before - 1000)

    expect((await send('PUT', `/api/me/${offer}`, null, cookie)).status).toBe(204)
    const after = await getProgress(cookie)
    expect(after[field]).toBe(askedAt)
    expect(after[other]).toBeNull()
  })
})

describe('PUT /api/me/lessons/:key', () => {
  it('records each finished lesson once and lists them', async () => {
    const { cookie } = await signedInUser(db, auth)
    for (const key of ['tutorial:overlap', 'techniques:what-if', 'tutorial:overlap']) {
      expect((await send('PUT', `/api/me/lessons/${key}`, null, cookie)).status).toBe(204)
    }
    expect((await getProgress(cookie)).lessonsDone.toSorted()).toEqual(['techniques:what-if', 'tutorial:overlap'])
  })

  it.each(['overlap', 'basics:overlap', 'tutorial:Overlap', 'tutorial:'])('rejects %s', async key => {
    const { cookie } = await signedInUser(db, auth)
    expect((await send('PUT', `/api/me/lessons/${key}`, null, cookie)).status).toBe(400)
    expect((await getProgress(cookie)).lessonsDone).toEqual([])
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
      elapsedMs: 0,
      attemptHinted: false,
    })
  })

  it('keeps the Attempt time and hint with the grid', async () => {
    const { cookie } = await signedInUser(db, auth)
    const body = { cells: '#...', replaying: false, updatedAt: '2026-01-01T00:00:00.000Z', elapsedMs: 4_200, attemptHinted: true }
    expect((await send('PUT', '/api/me/progress/diag', body, cookie)).status).toBe(200)
    expect((await getProgress(cookie)).puzzles.diag?.progress).toMatchObject({ elapsedMs: 4_200, attemptHinted: true })
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
    ['negative time', { cells: '#...', replaying: false, updatedAt: '2026-01-01T00:00:00.000Z', elapsedMs: -1 }],
    ['fractional time', { cells: '#...', replaying: false, updatedAt: '2026-01-01T00:00:00.000Z', elapsedMs: 1.5 }],
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
        crest: null,
        foil: false,
        hinted: false,
        solvedAt: expect.any(String),
        bestMs: null,
      },
    })
  })

  it('carries the Attempt time with a grid, and the best with a solve', async () => {
    const { cookie } = await signedInUser(db, auth)
    await importing(cookie, [{ id: 'diag', cells: '#xx#', solved: true, replaying: false, elapsedMs: 900, bestMs: 61_000 }])
    const { diag } = (await getProgress(cookie)).puzzles
    expect(diag).toMatchObject({ bestMs: 61_000, progress: { elapsedMs: 900 } })
  })

  it('keeps the lower of the account and imported best', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await db.insert(solveTable).values({ userId: id, puzzleId: 'diag', verified: true, bestMs: 30_000 })
    await importing(cookie, [{ id: 'diag', solved: true, replaying: false, bestMs: 61_000 }])
    expect((await getProgress(cookie)).puzzles.diag?.bestMs).toBe(30_000)
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

describe('handles', () => {
  const available = async (handle: string, cookie?: string) =>
    (await (
      await app.request(`/api/handles/${handle}/available`, { headers: cookie ? { cookie } : {} })
    ).json()) as HandleAvailability
  const rename = (cookie: string, handle: unknown) => send('PUT', '/api/me/handle', { handle }, cookie)

  it('reports free, taken (ignoring case), and invalid handles', async () => {
    await signedInUser(db, auth, 'pixel_fan')
    expect(await available('someone_new')).toEqual({ available: true })
    expect(await available('Pixel_Fan')).toEqual({ available: false, reason: 'taken' })
    expect(await available('ab')).toEqual({ available: false, reason: 'length' })
    expect(await available('admin')).toEqual({ available: false, reason: 'reserved' })
  })

  it("counts the player's own handle as available", async () => {
    const { cookie } = await signedInUser(db, auth, 'pixel_fan')
    expect(await available('PIXEL_FAN', cookie)).toEqual({ available: true })
  })

  it('renames and confirms the handle', async () => {
    const { id, cookie } = await signedInUser(db, auth, 'pixel_fan')
    expect(await (await rename(cookie, 'New_Name')).json()).toEqual({ handle: 'New_Name' })
    const rows = await db.select({ handle: user.handle, confirmed: user.handleConfirmed }).from(user).where(eq(user.id, id))
    expect(rows).toEqual([{ handle: 'New_Name', confirmed: true }])
  })

  it("409s on another player's handle in any case, but allows recasing one's own", async () => {
    await signedInUser(db, auth, 'pixel_fan')
    const { cookie } = await signedInUser(db, auth, 'other')
    const res = await rename(cookie, 'PIXEL_fan')
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ reason: 'taken' })
    expect((await rename(cookie, 'OTHER')).status).toBe(200)
  })

  it.each([
    ['too short', 'ab'],
    ['bad characters', 'no spaces'],
    ['reserved', 'settings'],
    ['blocked', 'shithead'],
    ['not a string', 42],
  ])('400s on %s', async (_, handle) => {
    const { cookie } = await signedInUser(db, auth)
    expect((await rename(cookie, handle)).status).toBe(400)
  })
})

describe('GET /api/users/:handle', () => {
  const profileApp = createApp([fixture('alpha', { one: [diagonal] }), fixture('beta', { two: [dot] })], { db, auth })
  const profile = async (handle: string, cookie?: string) =>
    (await (await profileApp.request(`/api/users/${handle}`, { headers: cookie ? { cookie } : {} })).json()) as Profile

  /** Verified `diag`, unverified `dot`, and a verified solve of a puzzle no longer in any campaign. */
  async function owner() {
    const o = await signedInUser(db, auth, 'Owner')
    await db.insert(solveTable).values([
      { userId: o.id, puzzleId: 'diag', verified: true, solvedAt: new Date('2026-01-01') },
      { userId: o.id, puzzleId: 'dot', verified: false, solvedAt: new Date('2026-01-02') },
      { userId: o.id, puzzleId: 'retired', verified: true, solvedAt: new Date('2026-01-03') },
    ])
    return o
  }

  /** `alpha` is a single page, so its one puzzle completes the album. */
  const alphaStamps = (foil = false) =>
    (['first-sticker', ...(foil ? ['first-foil', 'perfect-page'] : []), 'album-complete'] as StampId[]).map(id => ({
      id,
      earnedAt: '2026-01-01T00:00:00.000Z',
    }))

  const verifiedOnly: Profile = {
    handle: 'Owner',
    image: null,
    joinedAt: expect.any(String),
    verifiedSolves: 1,
    campaigns: [{ id: 'alpha', verifiedPuzzleIds: ['diag'], foilPuzzleIds: [], solvedAt: { diag: '2026-01-01T00:00:00.000Z' }, stamps: alphaStamps() }],
    years: [],
    showcase: [],
  }

  it('shows verified solves of known puzzles by campaign, without private fields', async () => {
    await owner()
    const body = await profile('owner')
    expect(body).toEqual<Profile>(verifiedOnly)
    expect(JSON.stringify(body)).not.toContain('@example.com')
  })

  it('shows the owner verified solves only too', async () => {
    const o = await owner()
    expect(await profile('OWNER', o.cookie)).toEqual<Profile>(verifiedOnly)
  })

  it('orders campaigns by their most recent verified solve', async () => {
    const o = await owner()
    await db.update(solveTable).set({ verified: true }).where(eq(solveTable.userId, o.id))
    expect((await profile('owner')).campaigns).toEqual([
      {
        id: 'beta',
        verifiedPuzzleIds: ['dot'],
        foilPuzzleIds: [],
        solvedAt: { dot: '2026-01-02T00:00:00.000Z' },
        stamps: [
          { id: 'first-sticker', earnedAt: '2026-01-02T00:00:00.000Z' },
          { id: 'album-complete', earnedAt: '2026-01-02T00:00:00.000Z' },
        ],
      },
      { id: 'alpha', verifiedPuzzleIds: ['diag'], foilPuzzleIds: [], solvedAt: { diag: '2026-01-01T00:00:00.000Z' }, stamps: alphaStamps() },
    ])
  })

  it('lists foil stickers among the verified ones', async () => {
    await owner()
    await db.update(solveTable).set({ foil: true }).where(eq(solveTable.puzzleId, 'diag'))
    expect((await profile('owner')).campaigns).toEqual([
      { id: 'alpha', verifiedPuzzleIds: ['diag'], foilPuzzleIds: ['diag'], solvedAt: { diag: '2026-01-01T00:00:00.000Z' }, stamps: alphaStamps(true) },
    ])
  })

  it('404s on an unknown handle', async () => {
    expect((await profileApp.request('/api/users/nobody')).status).toBe(404)
  })
})

describe('PUT /api/me/showcase', () => {
  const puzzles = { one: [diagonal, dot, ...['a', 'b', 'c'].map(id => ({ ...dot, id }))] }
  const showcaseApp = createApp([fixture('alpha', puzzles)], { db, auth })
  const put = (puzzleIds: unknown, cookie: string) =>
    showcaseApp.request('/api/me/showcase', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ puzzleIds }),
    })
  const showcaseOf = async (handle: string) =>
    ((await (await showcaseApp.request(`/api/users/${handle}`)).json()) as Profile).showcase

  async function player() {
    const p = await signedInUser(db, auth, 'Picker')
    await db.insert(solveTable).values(
      ['diag', 'dot', 'a', 'b', 'c'].map(puzzleId => ({ userId: p.id, puzzleId, verified: true })),
    )
    return p
  }

  it('keeps the picks in order, on the profile and in progress', async () => {
    const { cookie } = await player()
    const res = await put(['dot', 'diag', 'b'], cookie)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ puzzleIds: ['dot', 'diag', 'b'] })
    expect(await showcaseOf('picker')).toEqual(['dot', 'diag', 'b'])
    const progress = await showcaseApp.request('/api/me/progress', { headers: { cookie } })
    expect(((await progress.json()) as MyProgress).showcase).toEqual(['dot', 'diag', 'b'])
  })

  it('can be emptied', async () => {
    const { cookie } = await player()
    await put(['dot'], cookie)
    expect((await put([], cookie)).status).toBe(200)
    expect(await showcaseOf('picker')).toEqual([])
  })

  it('400s on more than three, repeats, or a malformed body', async () => {
    const { cookie } = await player()
    for (const ids of [['diag', 'dot', 'a', 'b'], ['dot', 'dot'], 'dot', [1], undefined]) {
      expect((await put(ids, cookie)).status).toBe(400)
    }
    expect(await showcaseOf('picker')).toEqual([])
  })

  it('400s on a sticker that is unverified, unknown, or not yours', async () => {
    const { cookie, id } = await player()
    await db.update(solveTable).set({ verified: false }).where(eq(solveTable.puzzleId, 'a'))
    const other = await signedInUser(db, auth, 'other')
    await db.insert(solveTable).values({ userId: other.id, puzzleId: 'diag', verified: true })
    await db.delete(solveTable).where(and(eq(solveTable.userId, id), eq(solveTable.puzzleId, 'diag')))
    for (const ids of [['dot', 'a'], ['dot', 'nope'], ['dot', 'diag']]) {
      expect((await put(ids, cookie)).status).toBe(400)
    }
    expect(await showcaseOf('picker')).toEqual([])
  })

  it('leaves out a pick whose puzzle has been retired', async () => {
    const { cookie } = await player()
    await put(['dot', 'c'], cookie)
    const retired = createApp([fixture('alpha', { one: [diagonal, dot] })], { db, auth })
    const profile = (await (await retired.request('/api/users/picker')).json()) as Profile
    expect(profile.showcase).toEqual(['dot'])
  })
})

describe('account deletion', () => {
  it('removes the user and every row that belongs to them', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    const bystander = await signedInUser(db, auth, 'bystander')
    for (const u of [id, bystander.id]) {
      await db.insert(account).values({ id: `acct-${u}`, accountId: u, providerId: 'google', userId: u, updatedAt: new Date() })
      await db.insert(solveTable).values({ userId: u, puzzleId: 'diag', verified: true })
      await db.insert(progressTable).values({ userId: u, puzzleId: 'diag', cells: '#..#', updatedAt: new Date() })
      await db.insert(userSettings).values({
        userId: u,
        assists: { fadeClues: true, impossibleLines: true, autoMarkEmptyLines: true, crosshair: true, lockLine: true },
      })
    }

    const res = await app.request('/api/auth/delete-user', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'http://localhost', cookie },
      body: '{}',
    })
    expect(res.status).toBe(200)

    for (const [table, column] of [
      [user, user.id],
      [session, session.userId],
      [account, account.userId],
      [solveTable, solveTable.userId],
      [progressTable, progressTable.userId],
      [userSettings, userSettings.userId],
    ] as const) {
      expect(await db.$count(table, eq(column, id))).toBe(0)
      expect(await db.$count(table, eq(column, bystander.id))).toBe(1)
    }
  })
})

describe('Dailies', () => {
  const acorn = ['.###.', '#####', '.###.', '.###.', '..#..']
  const { dailies } = checkDailies({
    launch: '2026-10-01',
    seeds: [{ date: '2026-10-05', title: 'Acorn', palette: { '#': '#7a4a21' }, rows: acorn }],
  })
  let clock = 0
  const dailyApp = createApp([fixture('main', { first: [diagonal] })], { db, auth, now: () => clock }, dailies)
  const id = 'daily:2026-10-05'
  const cells = [...acorn.join('')].map(ch => (ch === '#' ? 'filled' : 'empty'))
  const during = Date.parse('2026-10-05T12:00:00Z')
  const after = Date.parse('2026-10-06T13:00:00Z')

  const request = (method: string, path: string, body?: unknown, cookie?: string) =>
    dailyApp.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    })

  beforeEach(() => {
    clock = during
  })

  it('serves a Daily on its date with its date as context', async () => {
    expect(await (await request('GET', `/api/puzzles/${id}`)).json()).toEqual<PuzzleClues>({
      id,
      title: 'Acorn',
      width: 5,
      height: 5,
      filledCount: 15,
      daily: '2026-10-05',
      clues: expect.any(Object),
    })
  })

  it('generates a Daily for a date with none authored', async () => {
    clock = Date.parse('2026-10-19T12:00:00Z')
    const body = (await (await request('GET', '/api/puzzles/daily:2026-10-19')).json()) as PuzzleClues
    expect(body).toMatchObject({ title: 'Quarry', daily: '2026-10-19' })
  })

  it('records a solve inside the window', async () => {
    const { cookie } = await signedInUser(db, auth)
    const res = (await (await request('POST', `/api/puzzles/${id}/solve`, { cells }, cookie)).json()) as SolveResponse
    expect(res).toMatchObject({ solved: true, foil: true })
    expect(res).not.toHaveProperty('crest')
    expect((await getProgress(cookie)).puzzles[id]).toMatchObject({ solved: 'verified', crest: null })
  })

  it('404s outside the window, before launch and on malformed dates', async () => {
    const { cookie } = await signedInUser(db, auth)
    clock = after
    expect((await request('GET', `/api/puzzles/${id}`)).status).toBe(404)
    expect((await request('POST', `/api/puzzles/${id}/solve`, { cells }, cookie)).status).toBe(404)
    expect((await request('POST', `/api/puzzles/${id}/hint`, { cells: '.'.repeat(25) }, cookie)).status).toBe(404)
    const grid = { cells: '#'.repeat(25), replaying: false, updatedAt: new Date(after).toISOString() }
    expect((await request('PUT', `/api/me/progress/${id}`, grid, cookie)).status).toBe(404)
    clock = Date.parse('2026-09-30T12:00:00Z')
    expect((await request('GET', '/api/puzzles/daily:2026-09-30')).status).toBe(404)
    expect((await request('GET', '/api/puzzles/daily:2026-10-5')).status).toBe(404)
    expect(await db.$count(solveTable)).toBe(0)
  })

  it('imports a Daily solve after its date, but not one still to come', async () => {
    const { cookie } = await signedInUser(db, auth)
    clock = after
    const puzzles = [
      { id, cells: acorn.join(''), solved: true, replaying: false },
      { id: 'daily:2026-10-08', solved: true, replaying: false },
    ]
    const res = await request('POST', '/api/me/import', { puzzles }, cookie)
    expect(await res.json()).toEqual<ImportResponse>({ results: { [id]: 'verified', 'daily:2026-10-08': 'ignored' } })
  })

  it('lists the Year up to the last date open anywhere, without future titles', async () => {
    clock = Date.parse('2026-10-05T10:00:00Z')
    const year = (await (await request('GET', '/api/daily/2026')).json()) as DailyYear
    expect(year.launch).toBe('2026-10-01')
    expect(year.months.map(m => m.length)).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 6, 0, 0])
    expect(year.months[9]![4]).toEqual({ id, title: 'Acorn', width: 5, height: 5, filledCount: 15, date: '2026-10-05' })
    expect(year.months[9]!.at(-1)!.date).toBe('2026-10-06')
    expect((await request('GET', '/api/daily/2025')).status).toBe(404)
    expect((await request('GET', '/api/daily/2027')).status).toBe(404)
  })

  it('groups Daily solves into Years on the profile, with their Stamps, and allows them in the Showcase', async () => {
    const { cookie } = await signedInUser(db, auth, 'Owner')
    await request('POST', `/api/puzzles/${id}/solve`, { cells }, cookie)
    expect((await request('PUT', '/api/me/showcase', { puzzleIds: [id] }, cookie)).status).toBe(200)
    const profile = (await (await request('GET', '/api/users/owner')).json()) as Profile
    expect(profile.campaigns).toEqual([])
    expect(profile.showcase).toEqual([id])
    expect(profile.years).toEqual([
      {
        id: 'daily-2026',
        verifiedPuzzleIds: [id],
        foilPuzzleIds: [id],
        solvedAt: { [id]: expect.any(String) },
        stamps: [
          { id: 'first-sticker', earnedAt: expect.any(String) },
          { id: 'first-foil', earnedAt: expect.any(String) },
        ],
      },
    ])
  })
})
