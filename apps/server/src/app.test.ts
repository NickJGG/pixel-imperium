import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type {
  Campaign,
  CampaignSummary,
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
import { buildCampaign } from './campaigns.ts'
import type { SeedPuzzle } from './puzzles.ts'
import { createTestDeps, signedInUser, truncateAll } from './test-db.ts'

// A deliberately ambiguous puzzle: the anti-diagonal satisfies the same clues as the stored diagonal.
const diagonal: SeedPuzzle = { id: 'diag', title: 'Diagonal', palette: { r: '#f00', b: '#00f' }, rows: ['r.', '.b'] }
const dot: SeedPuzzle = { id: 'dot', title: 'Dot', palette: { g: '#0f0' }, rows: ['g'] }

/** A draft campaign, so the fixture can skip the size rules. */
function fixture(id: string, provinces: Record<string, SeedPuzzle[]>) {
  return buildCampaign({
    campaign: {
      id,
      name: `Campaign ${id}`,
      draft: true,
      closingLine: 'Done.',
      puzzlesPerProvince: 30,
      provinces: Object.keys(provinces).map(p => ({ id: p, name: `Province ${p}`, theme: '', flavour: `${p} falls.`, minSize: 5, maxSize: 5 })),
    },
    provinces,
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
  it('lists campaigns in order, with any cover colour', async () => {
    const multi = createApp([{ ...fixture('b', { x: [] }), coverColour: '#c0392b' }, fixture('a', { y: [] })], {
      db,
      auth,
    })
    expect(await (await multi.request('/api/campaigns')).json()).toEqual<CampaignSummary[]>([
      { id: 'b', name: 'Campaign b', coverColour: '#c0392b' },
      { id: 'a', name: 'Campaign a' },
    ])
  })
})

describe('GET /api/campaigns/:id', () => {
  it('returns the provinces with puzzle summaries, without palettes', async () => {
    const res = await app.request('/api/campaigns/main')
    expect(await res.json()).toEqual<Campaign>({
      id: 'main',
      name: 'Campaign main',
      closingLine: 'Done.',
      provinces: [
        {
          id: 'first',
          name: 'Province first',
          theme: '',
          flavour: 'first falls.',
          puzzles: [{ id: 'diag', title: 'Diagonal', width: 2, height: 2, filledCount: 2 }],
        },
        { id: 'second', name: 'Province second', theme: '', flavour: 'second falls.', puzzles: [] },
      ],
    })
  })

  it('serves the techniques flag only where set', async () => {
    const base = fixture('t', { x: [], y: [] })
    const flagged = { ...base, provinces: [{ ...base.provinces[0]!, techniques: true as const }, base.provinces[1]!] }
    const { provinces } = (await (await createApp([flagged], { db, auth }).request('/api/campaigns/t')).json()) as Campaign
    expect(provinces.map(p => p.techniques)).toEqual([true, undefined])
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

describe('/api/me', () => {
  it.each([
    ['GET', '/api/me/progress'],
    ['PUT', '/api/me/progress/diag'],
    ['PUT', '/api/me/settings'],
    ['POST', '/api/me/import'],
    ['PUT', '/api/me/handle'],
    ['PUT', '/api/me/showcase'],
    ['PUT', '/api/me/tutorial'],
    ['PUT', '/api/me/lessons/tutorial:overlap'],
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
          foil: false,
          hinted: false,
        },
        other: { solved: 'unverified', progress: null, palette: null, foil: false, hinted: false },
      },
      assists,
      showcase: [],
      tutorialAskedAt: null,
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

describe('PUT /api/me/tutorial', () => {
  it('records when the tutorial was first offered and keeps that time', async () => {
    const { cookie } = await signedInUser(db, auth)
    const before = Date.now()
    expect((await send('PUT', '/api/me/tutorial', null, cookie)).status).toBe(204)
    const askedAt = (await getProgress(cookie)).tutorialAskedAt
    expect(new Date(askedAt!).getTime()).toBeGreaterThanOrEqual(before - 1000)

    expect((await send('PUT', '/api/me/tutorial', null, cookie)).status).toBe(204)
    expect((await getProgress(cookie)).tutorialAskedAt).toBe(askedAt)
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
        foil: false,
        hinted: false,
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
