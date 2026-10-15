import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type {
  Campaign,
  DraftCampaign,
  DraftCampaignDoc,
  DraftPuzzle,
  Drafts,
  Made,
  MyProgress,
  Played,
  Profile,
  PublishResponse,
  PutDraftCampaignResponse,
  PuzzleClues,
  RetiredError,
  SolveResponse,
} from '@pixel-imperium/protocol'
import { eq } from 'drizzle-orm'
import { createApp } from './app.ts'
import { buildCampaign } from './campaigns.ts'
import { draftPuzzle, madePuzzle, progress, report, solve as solveTable, user } from './db/schema.ts'
import { isMadeId, randomMadeId, takedown } from './made.ts'
import { createTestDeps, signedInUser, truncateAll } from './test-db.ts'

const { db, auth } = await createTestDeps()
const official = buildCampaign({
  campaign: {
    id: 'main',
    name: 'Main',
    draft: true,
    paper: 'throne',
    closingLine: 'Done.',
    puzzlesPerProvince: 30,
    provinces: [{ id: 'first', name: 'First', theme: '', flavour: '', paper: 'coast', minSize: 5, maxSize: 5 }],
  },
  provinces: { first: [{ id: 'dot', title: 'Dot', palette: { g: '#00ff00' }, rows: ['g'] }] },
})
const app = createApp([official], { db, auth })

beforeEach(() => truncateAll(db))
afterAll(() => db.$client.end())

const INK = '#112233'
const FULL = ['#####', '#####', '#####', '#####', '#####']
/** Two solutions: the anti-diagonal fits the same clues. */
const AMBIGUOUS = ['#....', '.#...', '..#..', '...#.', '....#']

function draft(rows: readonly string[], title = 'Block', updatedAt = '2026-10-01T00:00:00.000Z'): Omit<DraftPuzzle, 'id'> {
  return {
    title,
    width: rows[0]!.length,
    height: rows.length,
    cells: rows.flatMap(r => [...r].map(ch => (ch === '#' ? INK : null))),
    colors: [INK],
    paper: null,
    updatedAt,
  }
}

function call(method: string, path: string, cookie?: string, body?: unknown, headers: Record<string, string> = {}) {
  return app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }), ...headers },
    ...(body !== undefined && method !== 'GET' && { body: JSON.stringify(body) }),
  })
}

async function publishPuzzle(cookie: string, draftId = 'd1', rows = FULL, title = 'Block') {
  await call('PUT', `/me/drafts/puzzles/${draftId}`, cookie, draft(rows, title))
  const res = await call('POST', `/me/drafts/puzzles/${draftId}/publish`, cookie, {})
  expect(res.status).toBe(201)
  return ((await res.json()) as PublishResponse).id
}

const filled = (rows: readonly string[]) => rows.flatMap(r => [...r].map(ch => (ch === '#' ? 'filled' : 'empty')))

function solve(id: string, cookie?: string, rows = FULL) {
  return call('POST', `/puzzles/${id}/solve`, cookie, { cells: filled(rows), ms: 1000 })
}

function campaignDoc(provinces: string[][], crest: DraftCampaignDoc['crest'] = null): DraftCampaignDoc {
  return {
    title: 'My campaign',
    paper: '#ffd34a',
    provinces: provinces.map((puzzleIds, k) => ({ name: `P${k + 1}`, flavour: 'Fallen.', paper: null, puzzleIds })),
    crest,
  }
}

async function publishCampaign(cookie: string, provinces: string[][], crest: DraftCampaignDoc['crest'] = null) {
  await call('PUT', '/me/drafts/campaigns/c1', cookie, { doc: campaignDoc(provinces, crest), updatedAt: '2026-10-01T00:00:00Z' })
  const res = await call('POST', '/me/drafts/campaigns/c1/publish', cookie)
  expect(res.status).toBe(201)
  return ((await res.json()) as PublishResponse).id
}

describe('made ids', () => {
  it('are 10 lowercase letters and digits with at least one digit', () => {
    for (let i = 0; i < 200; i++) expect(randomMadeId()).toMatch(/^(?=.*\d)[a-z0-9]{10}$/)
    expect(isMadeId('harbourcat')).toBe(false)
    expect(isMadeId('harbour1ca')).toBe(true)
  })
})

describe('the Workshop API', () => {
  it.each([
    ['GET', '/me/drafts'],
    ['PUT', '/me/drafts/puzzles/d1'],
    ['POST', '/me/drafts/puzzles/d1/publish'],
    ['PUT', '/me/drafts/campaigns/c1'],
    ['GET', '/me/made'],
    ['GET', '/me/played'],
  ])('%s %s 401s without a session', async (method, path) => {
    expect((await call(method, path, undefined, {})).status).toBe(401)
  })
})

describe('draft puzzles', () => {
  it('saves, lists and returns a draft, keeping the newest write', async () => {
    const { cookie } = await signedInUser(db, auth)
    expect(await (await call('PUT', '/me/drafts/puzzles/d1', cookie, draft(FULL))).json()).toEqual({ applied: true })
    const older = draft(FULL, 'Older', '2026-09-01T00:00:00.000Z')
    expect(await (await call('PUT', '/me/drafts/puzzles/d1', cookie, older)).json()).toEqual({ applied: false })

    expect(await (await call('GET', '/me/drafts/puzzles/d1', cookie)).json()).toEqual<DraftPuzzle>({ id: 'd1', ...draft(FULL) })
    const list = (await (await call('GET', '/me/drafts', cookie)).json()) as Drafts
    expect(list.puzzles.map(p => [p.id, p.title])).toEqual([['d1', 'Block']])

    await call('DELETE', '/me/drafts/puzzles/d1', cookie)
    expect((await call('GET', '/me/drafts/puzzles/d1', cookie)).status).toBe(404)
  })

  it("keeps each Account's drafts apart", async () => {
    const a = await signedInUser(db, auth, 'a')
    const b = await signedInUser(db, auth, 'b')
    await call('PUT', '/me/drafts/puzzles/d1', a.cookie, draft(FULL))
    expect((await call('GET', '/me/drafts/puzzles/d1', b.cookie)).status).toBe(404)
  })

  it('400s on cells outside the strip or the wrong count', async () => {
    const { cookie } = await signedInUser(db, auth)
    const stray = { ...draft(FULL), cells: [...draft(FULL).cells.slice(1), '#ffffff'] }
    expect((await call('PUT', '/me/drafts/puzzles/d1', cookie, stray)).status).toBe(400)
    const short = { ...draft(FULL), cells: draft(FULL).cells.slice(1) }
    expect((await call('PUT', '/me/drafts/puzzles/d1', cookie, short)).status).toBe(400)
  })

  it('caps new drafts at 200 but still saves existing ones', async () => {
    const { id: userId, cookie } = await signedInUser(db, auth)
    const { updatedAt: _, ...body } = draft(FULL)
    await db
      .insert(draftPuzzle)
      .values(Array.from({ length: 200 }, (_, i) => ({ userId, id: `d${i}`, ...body, updatedAt: new Date(0) })))
    expect((await call('PUT', '/me/drafts/puzzles/new', cookie, draft(FULL))).status).toBe(409)
    expect((await call('PUT', '/me/drafts/puzzles/d0', cookie, draft(FULL))).status).toBe(200)
  })
})

describe('publishing a puzzle', () => {
  it('turns the draft into a playable puzzle with its Author and an id of its own', async () => {
    const { cookie } = await signedInUser(db, auth, 'mara')
    const id = await publishPuzzle(cookie)
    expect(isMadeId(id)).toBe(true)
    expect((await call('GET', '/me/drafts/puzzles/d1', cookie)).status).toBe(404)
    expect(await (await call('GET', `/puzzles/${id}`)).json()).toEqual<PuzzleClues>({
      id,
      title: 'Block',
      width: 5,
      height: 5,
      filledCount: 25,
      made: { author: 'mara' },
      clues: { rows: Array(5).fill([5]), cols: Array(5).fill([5]) },
    })
  })

  it('takes a title and paper from the confirm step', async () => {
    const { cookie } = await signedInUser(db, auth)
    await call('PUT', '/me/drafts/puzzles/d1', cookie, draft(FULL))
    const res = await call('POST', '/me/drafts/puzzles/d1/publish', cookie, { title: 'Brick', paper: '#3a3214' })
    const { id } = (await res.json()) as PublishResponse
    const p = (await (await call('GET', `/puzzles/${id}`)).json()) as PuzzleClues
    expect([p.title, 'made' in p && p.made.paper]).toEqual(['Brick', '#3a3214'])
  })

  it('422s on a puzzle with two solutions or off the size rules, leaving the draft', async () => {
    const { cookie } = await signedInUser(db, auth)
    for (const rows of [AMBIGUOUS, ['####', '####', '####', '####']]) {
      await call('PUT', '/me/drafts/puzzles/d1', cookie, draft(rows, 'Bad', new Date().toISOString()))
      expect((await call('POST', '/me/drafts/puzzles/d1/publish', cookie)).status).toBe(422)
    }
    expect((await call('GET', '/me/drafts/puzzles/d1', cookie)).status).toBe(200)
  })

  it('refuses a banned Author', async () => {
    const { id, cookie } = await signedInUser(db, auth)
    await db.update(user).set({ publishBannedAt: new Date() }).where(eq(user.id, id))
    await call('PUT', '/me/drafts/puzzles/d1', cookie, draft(FULL))
    expect((await call('POST', '/me/drafts/puzzles/d1/publish', cookie)).status).toBe(403)
  })

  it('allows 20 a day', async () => {
    const { id: authorId, cookie } = await signedInUser(db, auth)
    const seed = { id: 'x', title: 'x', palette: { k: INK }, rows: ['k'] }
    const rows = Array.from({ length: 20 }, () => ({ id: randomMadeId(), authorId, title: 'x', seed, passes: 1 }))
    await db.insert(madePuzzle).values(rows)
    await call('PUT', '/me/drafts/puzzles/d1', cookie, draft(FULL))
    expect((await call('POST', '/me/drafts/puzzles/d1/publish', cookie)).status).toBe(429)
    await db.update(madePuzzle).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(madePuzzle.id, rows[0]!.id))
    expect((await call('POST', '/me/drafts/puzzles/d1/publish', cookie)).status).toBe(201)
  })

  it('changes only the title and paper afterwards', async () => {
    const { cookie } = await signedInUser(db, auth)
    const id = await publishPuzzle(cookie)
    expect((await call('PATCH', `/me/made/puzzles/${id}`, cookie, { title: 'Brick', paper: '#123456' })).status).toBe(204)
    expect((await call('PATCH', `/me/made/puzzles/${id}`, cookie, { title: '' })).status).toBe(400)
    const { puzzles } = (await (await call('GET', '/me/made', cookie)).json()) as Made
    expect(puzzles.map(p => [p.title, p.paper, p.palette.length])).toEqual([['Brick', '#123456', 25]])
  })

  it("can't be edited by another Account", async () => {
    const a = await signedInUser(db, auth, 'a')
    const b = await signedInUser(db, auth, 'b')
    const id = await publishPuzzle(a.cookie)
    expect((await call('PATCH', `/me/made/puzzles/${id}`, b.cookie, { title: 'Mine' })).status).toBe(404)
    expect((await call('DELETE', `/me/made/puzzles/${id}`, b.cookie)).status).toBe(404)
  })
})

describe('draft campaigns', () => {
  it('previews tiers, publish problems and the crest count at each save', async () => {
    const { cookie } = await signedInUser(db, auth)
    const ids = Array.from({ length: 9 }, (_, i) => `d${i}`)
    for (const id of ids) await call('PUT', `/me/drafts/puzzles/${id}`, cookie, draft(FULL))
    await call('PUT', '/me/drafts/puzzles/bad', cookie, draft(AMBIGUOUS))
    const crest = { palette: { a: '#ff0000' }, rows: ['aa.'], regions: ['12.'] }
    const res = await call('PUT', '/me/drafts/campaigns/c1', cookie, {
      doc: campaignDoc([ids, ['bad', 'nope', 'd0']], crest),
      updatedAt: '2026-10-01T00:00:00Z',
    })
    const { applied, preview } = (await res.json()) as PutDraftCampaignResponse
    expect(applied).toBe(true)
    expect(preview.provinces[0]!.tiers).not.toBeNull()
    expect(preview.provinces[0]!.puzzles.every(p => !p.problem && p.passes === 1)).toBe(true)
    expect(preview.provinces[1]!.tiers).toBeNull()
    expect(preview.provinces[1]!.puzzles.map(p => p.problem)).toEqual(['fails', 'missing', 'taken'])
    expect(preview.crest).toEqual({ pixels: 2, puzzles: 12, fits: false })

    const got = (await (await call('GET', '/me/drafts/campaigns/c1', cookie)).json()) as DraftCampaign
    expect(got.preview).toEqual(preview)
  })

  it('caps them at 10', async () => {
    const { cookie } = await signedInUser(db, auth)
    for (let i = 0; i < 10; i++) {
      await call('PUT', `/me/drafts/campaigns/c${i}`, cookie, { doc: campaignDoc([]), updatedAt: '2026-10-01T00:00:00Z' })
    }
    const res = await call('PUT', '/me/drafts/campaigns/c10', cookie, { doc: campaignDoc([]), updatedAt: '2026-10-01T00:00:00Z' })
    expect(res.status).toBe(409)
  })
})

describe('publishing a campaign', () => {
  it('publishes its drafts, freezes tiers and serves provinces numbered from 1', async () => {
    const { cookie } = await signedInUser(db, auth, 'mara')
    const ids = Array.from({ length: 9 }, (_, i) => `d${i}`)
    for (const id of ids) await call('PUT', `/me/drafts/puzzles/${id}`, cookie, draft(FULL, id))
    const loose = await publishPuzzle(cookie, 'loose')
    const id = await publishCampaign(cookie, [ids, [loose]])

    const campaign = (await (await call('GET', `/campaigns/${id}`)).json()) as Campaign
    expect(campaign).toMatchObject({ id, name: 'My campaign', paper: '#ffd34a', author: 'mara' })
    expect(campaign.provinces.map(p => [p.id, p.name, p.paper, p.puzzles.length])).toEqual([
      ['1', 'P1', '#ffd34a', 9],
      ['2', 'P2', '#ffd34a', 1],
    ])
    expect(campaign.provinces[0]!.puzzles.map(p => p.title)).toEqual(ids)
    expect(campaign.provinces[0]!.puzzles.every(p => p.tier)).toBe(true)
    expect(campaign.provinces[1]!.puzzles[0]!.id).toBe(loose)

    const drafts = (await (await call('GET', '/me/drafts', cookie)).json()) as Drafts
    expect(drafts).toEqual({ puzzles: [], campaigns: [] })
    const p = (await (await call('GET', `/puzzles/${loose}`)).json()) as PuzzleClues
    expect('made' in p && p.made.campaign).toEqual({ id, provinceId: '2' })
  })

  it('finds a puzzle by the draft it was published from', async () => {
    const { cookie } = await signedInUser(db, auth)
    await publishPuzzle(cookie, 'd1')
    await publishCampaign(cookie, [['d1']])
  })

  it('422s on an empty province, a missing paper or a puzzle in another campaign', async () => {
    const { cookie } = await signedInUser(db, auth)
    const used = await publishPuzzle(cookie, 'a')
    await publishCampaign(cookie, [[used]])
    await call('PUT', '/me/drafts/puzzles/b', cookie, draft(FULL))
    for (const doc of [campaignDoc([['b'], []]), { ...campaignDoc([['b']]), paper: null }, campaignDoc([['b', used]])]) {
      await call('PUT', '/me/drafts/campaigns/c2', cookie, { doc, updatedAt: new Date().toISOString() })
      expect((await call('POST', '/me/drafts/campaigns/c2/publish', cookie)).status).toBe(422)
    }
  })

  it('keeps a crest that fits and releases its colors with solves', async () => {
    const { cookie } = await signedInUser(db, auth, 'a')
    const solver = await signedInUser(db, auth, 'b')
    await call('PUT', '/me/drafts/puzzles/d1', cookie, draft(FULL))
    const id = await publishCampaign(cookie, [['d1']], { palette: { a: '#ff0000' }, rows: ['.a'], regions: ['.1'] })
    const campaign = (await (await call('GET', `/campaigns/${id}`)).json()) as Campaign
    expect(campaign.crest).toEqual({ width: 2, height: 1, holes: [0] })
    const puzzle = campaign.provinces[0]!.puzzles[0]!
    expect(puzzle.crest).toBe(1)
    expect(((await (await solve(puzzle.id, solver.cookie)).json()) as SolveResponse & { solved: true }).crest).toBe('#ff0000')
  })

  it('drops a crest that no longer fits', async () => {
    const { cookie } = await signedInUser(db, auth)
    await call('PUT', '/me/drafts/puzzles/d1', cookie, draft(FULL))
    const id = await publishCampaign(cookie, [['d1']], { palette: { a: '#ff0000' }, rows: ['aa'], regions: ['11'] })
    expect(((await (await call('GET', `/campaigns/${id}`)).json()) as Campaign).crest).toBeUndefined()
  })

  it('allows 3 a day', async () => {
    const { cookie } = await signedInUser(db, auth)
    for (let i = 0; i < 3; i++) {
      await call('PUT', `/me/drafts/puzzles/d${i}`, cookie, draft(FULL))
      await publishCampaign(cookie, [[`d${i}`]])
    }
    await call('PUT', '/me/drafts/puzzles/d9', cookie, draft(FULL))
    await call('PUT', '/me/drafts/campaigns/c1', cookie, { doc: campaignDoc([['d9']]), updatedAt: new Date().toISOString() })
    expect((await call('POST', '/me/drafts/campaigns/c1/publish', cookie)).status).toBe(429)
  })

  it('keeps its structure but renames provinces', async () => {
    const { cookie } = await signedInUser(db, auth)
    await call('PUT', '/me/drafts/puzzles/d1', cookie, draft(FULL))
    const id = await publishCampaign(cookie, [['d1']])
    const provinces = [{ name: 'Renamed', flavour: 'Now.', paper: '#000000' }]
    expect((await call('PATCH', `/me/made/campaigns/${id}`, cookie, { title: 'New', provinces })).status).toBe(204)
    expect((await call('PATCH', `/me/made/campaigns/${id}`, cookie, { provinces: [...provinces, ...provinces] })).status).toBe(400)
    const campaign = (await (await call('GET', `/campaigns/${id}`)).json()) as Campaign
    expect([campaign.name, campaign.provinces[0]!.name, campaign.provinces[0]!.paper]).toEqual(['New', 'Renamed', '#000000'])
  })
})

describe('retiring and deleting', () => {
  it('deletes work nobody else started', async () => {
    const { cookie } = await signedInUser(db, auth)
    const id = await publishPuzzle(cookie)
    await solve(id, cookie)
    expect((await call('DELETE', `/me/made/puzzles/${id}`, cookie)).status).toBe(204)
    expect((await call('GET', `/puzzles/${id}`)).status).toBe(404)
  })

  it('only retires work another Account started', async () => {
    const author = await signedInUser(db, auth, 'mara')
    const player = await signedInUser(db, auth, 'p')
    const newcomer = await signedInUser(db, auth, 'n')
    const id = await publishPuzzle(author.cookie)
    await call('PUT', `/me/progress/${id}`, player.cookie, { cells: '.'.repeat(25), replaying: false, updatedAt: new Date().toISOString() })

    const del = await call('DELETE', `/me/made/puzzles/${id}`, author.cookie)
    expect([del.status, await del.json()]).toEqual([409, { error: 'others have started it; retire it instead', retire: true }])
    expect((await call('POST', `/me/made/puzzles/${id}/retire`, author.cookie)).status).toBe(204)

    const closed = await call('GET', `/puzzles/${id}`, newcomer.cookie)
    expect([closed.status, await closed.json()]).toEqual([410, { error: '@mara retired this', retired: true, author: 'mara' } satisfies RetiredError])
    expect((await call('GET', `/puzzles/${id}`)).status).toBe(410)
    for (const [path, cookie] of [[`/puzzles/${id}`, player.cookie], [`/puzzles/${id}`, author.cookie], [`/puzzles/${id}?started=1`, undefined]]) {
      const res = await call('GET', path!, cookie)
      expect(res.status).toBe(200)
      expect(((await res.json()) as PuzzleClues & { made: { retired?: true } }).made.retired).toBe(true)
    }
    expect((await solve(id, player.cookie)).status).toBe(200)
  })

  it("won't retire or delete a puzzle on its own once it's in a campaign", async () => {
    const { cookie } = await signedInUser(db, auth)
    const id = await publishPuzzle(cookie)
    await publishCampaign(cookie, [[id]])
    expect((await call('POST', `/me/made/puzzles/${id}/retire`, cookie)).status).toBe(409)
    expect((await call('DELETE', `/me/made/puzzles/${id}`, cookie)).status).toBe(409)
  })

  it('retires a campaign for newcomers while anyone who started any of its puzzles plays on', async () => {
    const author = await signedInUser(db, auth, 'mara')
    const player = await signedInUser(db, auth, 'p')
    const newcomer = await signedInUser(db, auth, 'n')
    for (const d of ['d1', 'd2']) await call('PUT', `/me/drafts/puzzles/${d}`, author.cookie, draft(FULL))
    const id = await publishCampaign(author.cookie, [['d1', 'd2']])
    const [first, second] = ((await (await call('GET', `/campaigns/${id}`)).json()) as Campaign).provinces[0]!.puzzles
    await solve(first!.id, player.cookie)

    expect((await call('DELETE', `/me/made/campaigns/${id}`, author.cookie)).status).toBe(409)
    expect((await call('POST', `/me/made/campaigns/${id}/retire`, author.cookie)).status).toBe(204)
    expect((await call('GET', `/campaigns/${id}`, newcomer.cookie)).status).toBe(410)
    expect((await call('GET', `/puzzles/${second!.id}`, newcomer.cookie)).status).toBe(410)
    const played = await call('GET', `/campaigns/${id}`, player.cookie)
    expect([played.status, ((await played.json()) as Campaign).retired]).toEqual([200, true])
    expect((await call('GET', `/puzzles/${second!.id}`, player.cookie)).status).toBe(200)
  })

  it('deletes an unplayed campaign, leaving its puzzles published', async () => {
    const { cookie } = await signedInUser(db, auth)
    const puzzle = await publishPuzzle(cookie)
    const id = await publishCampaign(cookie, [[puzzle]])
    expect((await call('DELETE', `/me/made/campaigns/${id}`, cookie)).status).toBe(204)
    expect((await call('GET', `/campaigns/${id}`)).status).toBe(404)
    const p = (await (await call('GET', `/puzzles/${puzzle}`)).json()) as PuzzleClues
    expect('made' in p && p.made.campaign).toBeUndefined()
  })
})

describe('takedown', () => {
  it('404s the puzzle for everyone, as if it never existed, and can ban its Author', async () => {
    const author = await signedInUser(db, auth)
    const player = await signedInUser(db, auth, 'p')
    const id = await publishPuzzle(author.cookie)
    await solve(id, player.cookie)
    expect(await takedown(db, id, true)).toEqual({ kind: 'puzzle', authorId: author.id })
    for (const cookie of [undefined, player.cookie, author.cookie]) {
      const res = await call('GET', `/puzzles/${id}`, cookie)
      expect([res.status, await res.json()]).toEqual([404, { error: `no puzzle '${id}'` }])
    }
    await call('PUT', '/me/drafts/puzzles/d2', author.cookie, draft(FULL))
    expect((await call('POST', '/me/drafts/puzzles/d2/publish', author.cookie)).status).toBe(403)
  })

  it('takes a campaign down with its puzzles', async () => {
    const { cookie } = await signedInUser(db, auth)
    const puzzle = await publishPuzzle(cookie)
    const id = await publishCampaign(cookie, [[puzzle]])
    expect(await takedown(db, id, false)).toMatchObject({ kind: 'campaign' })
    expect((await call('GET', `/campaigns/${id}`)).status).toBe(404)
    expect((await call('GET', `/puzzles/${puzzle}`)).status).toBe(404)
    expect(await takedown(db, 'nothing123', false)).toBeNull()
  })
})

describe('solving player-made work', () => {
  it('records a Sticker, Foil and Best time but no Stamps, and stays off the Profile', async () => {
    const author = await signedInUser(db, auth)
    const player = await signedInUser(db, auth, 'p')
    const id = await publishPuzzle(author.cookie)
    const body = (await (await solve(id, player.cookie)).json()) as SolveResponse & { solved: true }
    expect([body.foil, body.stamps, body.palette.length]).toEqual([true, undefined, 25])

    const [row] = await db.select().from(solveTable).where(eq(solveTable.puzzleId, id))
    expect([row!.verified, row!.bestMs]).toEqual([true, 1000])
    const mine = (await (await call('GET', '/me/progress', player.cookie)).json()) as MyProgress
    expect(mine.puzzles[id]?.palette).toHaveLength(25)

    const profile = (await (await call('GET', '/users/p')).json()) as Profile
    expect([profile.verifiedSolves, profile.campaigns]).toEqual([0, []])
    expect((await call('PUT', '/me/showcase', player.cookie, { puzzleIds: [id] })).status).toBe(400)
  })

  it("records nothing of the Author's own play", async () => {
    const { cookie } = await signedInUser(db, auth)
    const id = await publishPuzzle(cookie)
    const body = (await (await solve(id, cookie)).json()) as SolveResponse & { solved: true }
    expect([body.solved, body.foil]).toEqual([true, null])
    const put = await call('PUT', `/me/progress/${id}`, cookie, { cells: '.'.repeat(25), replaying: false, updatedAt: new Date().toISOString() })
    expect(await put.json()).toEqual({ applied: false })
    await call('POST', `/puzzles/${id}/hint`, cookie, { cells: '.'.repeat(25) })
    expect(await db.select().from(solveTable)).toEqual([])
    expect(await db.select().from(progress)).toEqual([])
  })

  it('imports signed-out progress on player-made puzzles, but not the Author’s own', async () => {
    const author = await signedInUser(db, auth)
    const player = await signedInUser(db, auth, 'p')
    const id = await publishPuzzle(author.cookie)
    const item = { id, cells: '#'.repeat(25), solved: true, replaying: false }
    const imported = async (cookie: string) =>
      ((await (await call('POST', '/me/import', cookie, { puzzles: [item] })).json()) as { results: Record<string, string> }).results[id]
    expect(await imported(player.cookie)).toBe('verified')
    expect(await imported(author.cookie)).toBe('ignored')
  })
})

describe('GET /api/me/played', () => {
  it("lists others' work the player started, standalone puzzles apart from campaigns", async () => {
    const author = await signedInUser(db, auth, 'mara')
    const player = await signedInUser(db, auth, 'p')
    const loose = await publishPuzzle(author.cookie, 'loose')
    for (const d of ['d1', 'd2']) await call('PUT', `/me/drafts/puzzles/${d}`, author.cookie, draft(FULL, d))
    const campaignId = await publishCampaign(author.cookie, [['d1'], ['d2']])
    const [inCampaign] = ((await (await call('GET', `/campaigns/${campaignId}`)).json()) as Campaign).provinces[0]!.puzzles
    const own = await publishPuzzle(player.cookie, 'own')

    await solve(loose, player.cookie)
    await solve(inCampaign!.id, player.cookie)
    await solve(own, player.cookie)
    await solve('dot', player.cookie, ['#'])

    expect(await (await call('GET', '/me/played', player.cookie)).json()).toEqual<Played>({
      puzzles: [{ id: loose, title: 'Block', width: 5, height: 5, filledCount: 25, author: 'mara', paper: null, solved: true }],
      campaigns: [{ id: campaignId, title: 'My campaign', author: 'mara', paper: '#ffd34a', total: 2, solved: 1 }],
    })
  })
})

describe('POST /api/reports', () => {
  it('records a report, signed out too', async () => {
    const { cookie } = await signedInUser(db, auth)
    const id = await publishPuzzle(cookie)
    const ip = { 'x-forwarded-for': '10.0.0.1' }
    expect((await call('POST', '/reports', undefined, { targetId: id, reason: 'Rude' }, ip)).status).toBe(204)
    expect((await call('POST', '/reports', cookie, { targetId: id, reason: 'Spam' })).status).toBe(204)
    const rows = await db.select().from(report)
    expect(rows.map(r => [r.targetId, r.reason, r.reporterIp, r.reporterId !== null])).toEqual([
      [id, 'Rude', '10.0.0.1', false],
      [id, 'Spam', null, true],
    ])
  })

  it('404s on anything but live player-made work', async () => {
    const ip = { 'x-forwarded-for': '10.0.0.2' }
    for (const targetId of ['dot', 'abcdefghi1']) {
      expect((await call('POST', '/reports', undefined, { targetId, reason: 'x' }, ip)).status).toBe(404)
    }
  })

  it('429s past ten an hour', async () => {
    const ip = { 'x-forwarded-for': '10.0.0.3' }
    const statuses = []
    for (let i = 0; i < 11; i++) statuses.push((await call('POST', '/reports', undefined, { targetId: 'x', reason: 'x' }, ip)).status)
    expect(statuses.at(-1)).toBe(429)
  })
})
