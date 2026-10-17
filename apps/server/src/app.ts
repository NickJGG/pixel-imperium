import { type Context, Hono } from 'hono'
import { hintFor, satisfiesClues } from '@pixel-imperium/nonogram'
import type {
  ApiError,
  Assists,
  Campaign as CampaignPayload,
  CampaignSummary,
  DailyYear,
  HandleAvailability,
  HandleRejection,
  HintResponse,
  ImportItem,
  ImportOutcome,
  ImportResponse,
  MyProgress,
  Profile,
  ProfileCampaign,
  PutHandleResponse,
  PutProgressResponse,
  PuzzleClues,
  HexPaper,
  PuzzleRecord,
  PuzzleSummary,
  RetiredError,
  Showcase,
  SolveResponse,
  SolveStamps,
} from '@pixel-imperium/protocol'
import { and, eq, inArray, isNull } from 'drizzle-orm'
import type { Auth } from './auth.ts'
import type { Db } from './db/index.ts'
import { hint, lessonDone, madeCampaign, madePuzzle, progress, solve, user, userSettings } from './db/schema.ts'
import { handleIs, handleProblem } from './handles.ts'
import { rateLimiter } from './rate-limit.ts'
import { parseCells, planImport } from './import.ts'
import type { Campaign } from './campaigns.ts'
import { type Dailies, dailyFor, datesInMonth, latestPlayableDate, yearAlbum } from './dailies.ts'
import { stampsFor } from './stamps.ts'
import { type MadeCampaignRow, type MadePuzzle, isMadeId, madeCrest, madePuzzleFrom } from './made.ts'
import { workshopRoutes } from './workshop.ts'
import { friendsRoutes, friendshipOf } from './friends.ts'
import { type Catalog, type Viewer, createCatalog, upsertProgress } from './catalog.ts'
import { PartyHub } from './party/server.ts'
import { partyRoutes } from './party/routes.ts'

export interface AppDeps {
  db: Db
  auth: Auth
  /** The clock Dailies are gated by. */
  now?: () => number
  /** Built over the same catalog when absent. */
  party?: PartyHub
}

type SessionUser = Auth['$Infer']['Session']['user']

export type AppEnv = { Variables: { user: SessionUser | null } }

export const viewerOf = (c: Context<AppEnv>): Viewer => ({
  userId: c.get('user')?.id ?? null,
  started: c.req.query('started') === '1',
})

const ASSIST_KEYS = ['fadeClues', 'impossibleLines', 'autoMarkEmptyLines', 'crosshair', 'lockLine'] as const

function parseAssists(value: unknown): Assists | null {
  if (!value || typeof value !== 'object') return null
  const assists = Object.fromEntries(ASSIST_KEYS.map(k => [k, (value as Record<string, unknown>)[k]]))
  return Object.values(assists).every(v => typeof v === 'boolean') ? (assists as unknown as Assists) : null
}

/** A duration the `integer` columns can hold. */
const isMs = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 2 ** 31 - 1

function parseImportItem(value: unknown): ImportItem | null {
  if (!value || typeof value !== 'object') return null
  const { id, cells, solved, replaying, hinted, elapsedMs, bestMs } = value as Record<string, unknown>
  if (typeof id !== 'string' || typeof solved !== 'boolean' || typeof replaying !== 'boolean') return null
  if (cells !== undefined && typeof cells !== 'string') return null
  if (hinted !== undefined && typeof hinted !== 'boolean') return null
  return {
    id,
    solved,
    replaying,
    ...(cells !== undefined && { cells }),
    ...(hinted && { hinted }),
    ...(isMs(elapsedMs) && { elapsedMs }),
    ...(isMs(bestMs) && { bestMs }),
  }
}

const SHOWCASE_SIZE = 3

const LESSON_KEY = /^(tutorial|techniques):[a-z0-9-]+$/

/** Distinct puzzle ids, at most `SHOWCASE_SIZE`; whether they're the player's verified solves is checked separately. */
function parseShowcase(value: unknown): string[] | null {
  const ids = (value as { puzzleIds?: unknown } | null)?.puzzleIds
  if (!Array.isArray(ids) || ids.length > SHOWCASE_SIZE || !ids.every(id => typeof id === 'string')) return null
  return new Set(ids).size === ids.length ? ids : null
}

/** Postgres `unique_violation`, which drizzle wraps as the cause of its own error. */
function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === '23505' || (e instanceof Error && isUniqueViolation(e.cause))
}

const summarize = ({ id, title, width, height, filledCount, tier }: PuzzleSummary): PuzzleSummary => ({
  id,
  title,
  width,
  height,
  filledCount,
  ...(tier && { tier }),
})

export function createApp(campaigns: readonly Campaign[], deps: AppDeps, dailies?: Dailies) {
  return createApi(createCatalog(campaigns, deps, dailies), deps)
}

export function createApi(catalog: Catalog, { db, auth, now = Date.now, party }: AppDeps) {
  const { campaigns, dailies, campaignsById, puzzleById, findPuzzle, mayPlayRetired, retiredError, crestOf } = catalog
  const { recordSolve, lowerBest, verifiedSolvesOf, solveStamps } = catalog
  const hub = party ?? new PartyHub({ db, auth, catalog, now })
  const isOwn = (c: Context<AppEnv>, p: Parameters<Catalog['isOwn']>[1]) => catalog.isOwn(c.get('user')?.id ?? null, p)
  const campaignPayloads = new Map(
    campaigns.map(({ id, name, released, paper, closingLine, crest, provinces }): [string, CampaignPayload] => [
      id,
      {
        id,
        name,
        ...(released && { released }),
        paper,
        closingLine,
        ...(crest && {
          crest: { width: crest.width, height: crest.height, ...(crest.holes.length > 0 && { holes: crest.holes }) },
        }),
        provinces: provinces.map(({ id, name, theme, flavour, paper, maxSize, techniques, puzzles }) => ({
          id,
          name,
          theme,
          flavour,
          paper,
          maxSize,
          ...(techniques && { techniques }),
          puzzles: puzzles.map(p => {
            const at = crest?.at.get(p.id)
            return { ...summarize(p), ...(at !== undefined && { crest: at }) }
          }),
        })),
      },
    ]),
  )

  /** Published puzzles by id; taken-down ones left out. */
  const madePuzzlesById = async (ids: readonly string[]) => {
    const wanted = ids.filter(isMadeId)
    if (wanted.length === 0) return new Map<string, MadePuzzle>()
    const rows = await db
      .select({ puzzle: madePuzzle, author: user.handle, campaign: madeCampaign })
      .from(madePuzzle)
      .innerJoin(user, eq(user.id, madePuzzle.authorId))
      .leftJoin(madeCampaign, eq(madeCampaign.id, madePuzzle.campaignId))
      .where(and(inArray(madePuzzle.id, wanted), isNull(madePuzzle.removedAt)))
    return new Map(
      rows
        .filter(r => !r.campaign?.removedAt)
        .map(r => [r.puzzle.id, madePuzzleFrom(r.puzzle, r.author, r.campaign)] as const),
    )
  }

  /** A published campaign as the album sees it; taken-down puzzles stay as blank slots. */
  const madeCampaignPayload = async (c: MadeCampaignRow, author: string): Promise<CampaignPayload> => {
    const rows = await db.select().from(madePuzzle).where(eq(madePuzzle.campaignId, c.id))
    const puzzles = new Map(rows.map(r => [r.id, r]))
    const crest = madeCrest(c)
    return {
      id: c.id,
      name: c.title,
      paper: c.paper as HexPaper,
      closingLine: '',
      ...(crest && {
        crest: { width: crest.width, height: crest.height, ...(crest.holes.length > 0 && { holes: crest.holes }) },
      }),
      provinces: c.provinces.map((province, k) => {
        const summaries = province.puzzleIds.flatMap((id): PuzzleSummary[] => {
          const row = puzzles.get(id)
          if (!row) return []
          const at = crest?.at.get(id)
          return [
            {
              ...summarize(madePuzzleFrom(row, author, c)),
              ...(row.removedAt && { title: '', removed: true as const }),
              ...(at !== undefined && { crest: at }),
            },
          ]
        })
        return {
          id: String(k + 1),
          name: province.name,
          theme: '',
          flavour: province.flavour,
          paper: province.paper ?? (c.paper as HexPaper),
          maxSize: Math.max(0, ...summaries.map(p => Math.max(p.width, p.height))),
          puzzles: summaries,
        }
      }),
      author,
      ...(c.retiredAt && { retired: true as const }),
    }
  }

  const hintAllowed = rateLimiter(60, 60_000)

  return new Hono<AppEnv>()
    .basePath('/api')
    .get('/health', c => c.text('ok'))
    .on(['GET', 'POST'], '/auth/*', c => auth.handler(c.req.raw))
    .use(async (c, next) => {
      const session = await auth.api.getSession({ headers: c.req.raw.headers })
      c.set('user', session?.user ?? null)
      await next()
    })
    .use('/me/*', async (c, next) => {
      if (!c.get('user')) return c.json<ApiError>({ error: 'not signed in' }, 401)
      await next()
    })
    .get('/campaigns', c =>
      c.json(
        campaigns.map(
          ({ id, name, released, paper, provinces }): CampaignSummary => ({
            id,
            name,
            ...(released && { released }),
            paper,
            total: provinces.reduce((n, p) => n + p.puzzles.length, 0),
          }),
        ),
      ),
    )
    .get('/campaigns/:id', async c => {
      const id = c.req.param('id')
      const official = campaignPayloads.get(id)
      if (official) return c.json(official)
      const [row] = isMadeId(id)
        ? await db
            .select({ campaign: madeCampaign, author: user.handle })
            .from(madeCampaign)
            .innerJoin(user, eq(user.id, madeCampaign.authorId))
            .where(and(eq(madeCampaign.id, id), isNull(madeCampaign.removedAt)))
        : []
      if (!row) return c.json<ApiError>({ error: `no campaign '${id}'` }, 404)
      const { campaign, author } = row
      const ids = campaign.provinces.flatMap(p => p.puzzleIds)
      if (campaign.retiredAt && !(await mayPlayRetired(viewerOf(c), campaign.authorId, ids))) {
        return c.json<RetiredError>(retiredError(author), 410)
      }
      return c.json(await madeCampaignPayload(campaign, author))
    })
    .get('/daily/:year', c => {
      const year = Number(c.req.param('year'))
      const last = latestPlayableDate(now())
      if (!Number.isInteger(year) || year < Number(dailies.launch.slice(0, 4)) || year > Number(last.slice(0, 4))) {
        return c.json<ApiError>({ error: `no Dailies in '${c.req.param('year')}'` }, 404)
      }
      const months = Array.from({ length: 12 }, (_, i) =>
        datesInMonth(year, i + 1, dailies.launch, last).map(date => ({ ...summarize(dailyFor(dailies, date)!), date })),
      )
      return c.json<DailyYear>({ year, launch: dailies.launch, months })
    })
    .get('/puzzles/:id', async c => {
      const found = await findPuzzle(viewerOf(c), c.req.param('id'))
      if ('status' in found) return c.json(found.error, found.status)
      const p = found.puzzle
      const context =
        'date' in p
          ? { daily: p.date }
          : 'made' in p
            ? { made: p.made }
            : { campaignId: p.campaignId, provinceId: p.provinceId }
      return c.json<PuzzleClues>({ ...summarize(p), ...context, clues: p.clues })
    })
    .post('/puzzles/:id/solve', async c => {
      const found = await findPuzzle(viewerOf(c), c.req.param('id'))
      if ('status' in found) return c.json(found.error, found.status)
      const p = found.puzzle

      const body = (await c.req.json().catch(() => null)) as { cells?: unknown; ms?: unknown; hinted?: unknown } | null
      const cells = body?.cells
      if (
        !Array.isArray(cells) ||
        cells.length !== p.width * p.height ||
        !cells.every(cell => cell === 'filled' || cell === 'empty')
      ) {
        return c.json<ApiError>({ error: `cells must be ${p.width * p.height} of 'filled' | 'empty'` }, 400)
      }

      if (!satisfiesClues({ width: p.width, height: p.height, cells }, p.clues)) {
        return c.json<SolveResponse>({ solved: false })
      }
      // An Author's play of their own work is a playtest: it records nothing.
      const user = isOwn(c, p) ? null : c.get('user')
      let foil: boolean | null = null
      let stamps: SolveStamps | undefined
      if (user) {
        const hinted = await db.$count(hint, and(eq(hint.userId, user.id), eq(hint.puzzleId, p.id)))
        // No row back when the puzzle was verified already.
        const recorded = await recordSolve(db, user.id, p.id, 'verified', hinted === 0).returning({ id: solve.puzzleId })
        const [row] = await db
          .select({ foil: solve.foil })
          .from(solve)
          .where(and(eq(solve.userId, user.id), eq(solve.puzzleId, p.id)))
        foil = row!.foil
        const { ms, hinted: attemptHinted } = body!
        if (isMs(ms) && attemptHinted !== true) await lowerBest(db, user.id, p.id, ms)
        // Stamps are per album, so a one-puzzle campaign could farm them.
        if (!('made' in p)) stamps = await solveStamps(user.id, p, recorded.length > 0)
      }
      const crest = crestOf(p)
      return c.json<SolveResponse>({ solved: true, palette: p.palette, foil, ...(crest && { crest }), ...(stamps && { stamps }) })
    })
    .post('/puzzles/:id/hint', async c => {
      const found = await findPuzzle(viewerOf(c), c.req.param('id'))
      if ('status' in found) return c.json(found.error, found.status)
      const p = found.puzzle
      const user = c.get('user')
      if (!hintAllowed(user?.id ?? c.req.header('x-forwarded-for') ?? 'anonymous')) {
        return c.json<ApiError>({ error: 'too many hints; try again in a minute' }, 429)
      }

      const body = (await c.req.json().catch(() => null)) as { cells?: unknown } | null
      const cells = parseCells(body?.cells, p)
      if (!cells) return c.json<ApiError>({ error: `cells must be ${p.width * p.height} of '.#x'` }, 400)

      const nudge = hintFor(p.palette, cells)
      if (!nudge) return c.json<ApiError>({ error: 'nothing to hint: the grid is solved' }, 409)
      if (user && !isOwn(c, p)) await db.insert(hint).values({ userId: user.id, puzzleId: p.id }).onConflictDoNothing()
      return c.json<HintResponse>(nudge)
    })
    .get('/handles/:handle/available', async c => {
      const handle = c.req.param('handle')
      const problem = handleProblem(handle)
      const [holder] = problem ? [] : await db.select({ id: user.id }).from(user).where(handleIs(handle))
      const reason = problem ?? (holder && holder.id !== c.get('user')?.id ? 'taken' : null)
      return c.json<HandleAvailability>(reason ? { available: false, reason } : { available: true })
    })
    .get('/users/:handle', async c => {
      const [owner] = await db.select().from(user).where(handleIs(c.req.param('handle')))
      if (!owner) return c.json<ApiError>({ error: `no player '${c.req.param('handle')}'` }, 404)

      const solves = await verifiedSolvesOf(owner.id)
      // Insertion order follows the newest solve, so the most recently played album comes first.
      const byCampaign = new Map<string, ProfileCampaign>()
      const byYear = new Map<string, ProfileCampaign>()
      let verifiedSolves = 0
      for (const { puzzleId, foil, solvedAt } of solves) {
        const p = puzzleById(puzzleId)
        if (!p) continue
        verifiedSolves++
        const [albums, id] = 'date' in p ? [byYear, `daily-${p.date.slice(0, 4)}`] : [byCampaign, p.campaignId]
        const entry = albums.get(id) ?? { id, verifiedPuzzleIds: [], foilPuzzleIds: [], solvedAt: {}, stamps: [] }
        entry.verifiedPuzzleIds.push(puzzleId)
        if (foil) entry.foilPuzzleIds.push(puzzleId)
        entry.solvedAt[puzzleId] = solvedAt.toISOString()
        albums.set(id, entry)
      }
      for (const entry of byCampaign.values()) entry.stamps = stampsFor(campaignsById.get(entry.id)!, solves)
      for (const entry of byYear.values()) {
        const album = yearAlbum(dailies.launch, Number(entry.id.slice('daily-'.length)))
        entry.stamps = stampsFor(album, solves, { year: true })
      }
      const verified = new Set(solves.map(s => s.puzzleId))
      const viewer = c.get('user')
      return c.json<Profile>({
        handle: owner.handle,
        image: owner.image,
        joinedAt: owner.createdAt.toISOString(),
        verifiedSolves,
        campaigns: [...byCampaign.values()],
        years: [...byYear.values()],
        showcase: owner.showcase.filter(id => verified.has(id) && puzzleById(id)),
        friendship: viewer ? await friendshipOf(db, viewer.id, owner.id) : null,
      })
    })
    .route('/', workshopRoutes({ db, isOfficialId: catalog.isOfficialId }))
    .route('/', partyRoutes(hub))
    .route('/', friendsRoutes({ db, hub }))
    .put('/me/handle', async c => {
      const body = (await c.req.json().catch(() => null)) as { handle?: unknown } | null
      const handle = typeof body?.handle === 'string' ? body.handle : ''
      const problem = handleProblem(handle)
      if (problem) return c.json<HandleRejection>({ error: `handle rejected: ${problem}`, reason: problem }, 400)
      try {
        await db.update(user).set({ handle, handleConfirmed: true }).where(eq(user.id, c.get('user')!.id))
      } catch (e) {
        if (!isUniqueViolation(e)) throw e
        return c.json<HandleRejection>({ error: 'handle rejected: taken', reason: 'taken' }, 409)
      }
      return c.json<PutHandleResponse>({ handle })
    })
    .get('/me/progress', async c => {
      const userId = c.get('user')!.id
      const [solves, grids, hints, [settings], [me], lessons] = await Promise.all([
        db.select().from(solve).where(eq(solve.userId, userId)),
        db.select().from(progress).where(eq(progress.userId, userId)),
        db.select({ puzzleId: hint.puzzleId }).from(hint).where(eq(hint.userId, userId)),
        db.select().from(userSettings).where(eq(userSettings.userId, userId)),
        db
          .select({
            showcase: user.showcase,
            tutorialAskedAt: user.tutorialAskedAt,
            techniquesAskedAt: user.techniquesAskedAt,
          })
          .from(user)
          .where(eq(user.id, userId)),
        db.select({ lesson: lessonDone.lesson }).from(lessonDone).where(eq(lessonDone.userId, userId)),
      ])
      const records: Record<string, PuzzleRecord> = {}
      const record = (id: string) =>
        (records[id] ??= {
          solved: null,
          progress: null,
          palette: null,
          crest: null,
          foil: false,
          hinted: false,
          solvedAt: null,
          bestMs: null,
        })
      const made = await madePuzzlesById(solves.filter(s => s.verified && !puzzleById(s.puzzleId)).map(s => s.puzzleId))
      for (const s of solves) {
        const r = record(s.puzzleId)
        r.solved = s.verified ? 'verified' : 'unverified'
        r.foil = s.foil
        r.bestMs = s.bestMs
        if (s.verified) {
          const p = puzzleById(s.puzzleId) ?? made.get(s.puzzleId)
          r.palette = p?.palette ?? null
          r.crest = (p && crestOf(p)) ?? null
          r.solvedAt = s.solvedAt.toISOString()
        }
      }
      for (const { puzzleId } of hints) record(puzzleId).hinted = true
      for (const g of grids) {
        record(g.puzzleId).progress = {
          cells: g.cells,
          replaying: g.replaying,
          updatedAt: g.updatedAt.toISOString(),
          elapsedMs: g.elapsedMs,
          attemptHinted: g.attemptHinted,
        }
      }
      const showcase = (me?.showcase ?? []).filter(id => records[id]?.solved === 'verified' && puzzleById(id))
      return c.json<MyProgress>({
        puzzles: records,
        assists: settings?.assists ?? null,
        showcase,
        tutorialAskedAt: me?.tutorialAskedAt?.toISOString() ?? null,
        techniquesAskedAt: me?.techniquesAskedAt?.toISOString() ?? null,
        lessonsDone: lessons.map(l => l.lesson),
      })
    })
    .put('/me/tutorial', async c => {
      await db
        .update(user)
        .set({ tutorialAskedAt: new Date() })
        .where(and(eq(user.id, c.get('user')!.id), isNull(user.tutorialAskedAt)))
      return c.body(null, 204)
    })
    .put('/me/techniques', async c => {
      await db
        .update(user)
        .set({ techniquesAskedAt: new Date() })
        .where(and(eq(user.id, c.get('user')!.id), isNull(user.techniquesAskedAt)))
      return c.body(null, 204)
    })
    .put('/me/lessons/:key', async c => {
      const lesson = c.req.param('key')
      if (!LESSON_KEY.test(lesson)) return c.json<ApiError>({ error: 'unknown lesson' }, 400)
      await db.insert(lessonDone).values({ userId: c.get('user')!.id, lesson }).onConflictDoNothing()
      return c.body(null, 204)
    })
    .put('/me/showcase', async c => {
      const puzzleIds = parseShowcase(await c.req.json().catch(() => null))
      if (!puzzleIds) {
        return c.json<ApiError>({ error: `puzzleIds must be at most ${SHOWCASE_SIZE} distinct puzzle ids` }, 400)
      }
      const userId = c.get('user')!.id
      const known = puzzleIds.every(id => puzzleById(id))
      const owned =
        known && puzzleIds.length > 0
          ? await db.$count(
              solve,
              and(eq(solve.userId, userId), eq(solve.verified, true), inArray(solve.puzzleId, puzzleIds)),
            )
          : 0
      if (!known || owned !== puzzleIds.length) {
        return c.json<ApiError>({ error: 'every showcase sticker must be a verified solve of yours' }, 400)
      }
      await db.update(user).set({ showcase: puzzleIds }).where(eq(user.id, userId))
      return c.json<Showcase>({ puzzleIds })
    })
    .put('/me/progress/:id', async c => {
      const found = await findPuzzle(viewerOf(c), c.req.param('id'))
      if ('status' in found) return c.json(found.error, found.status)
      const p = found.puzzle

      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
      const updatedAt = new Date(typeof body?.updatedAt === 'string' ? body.updatedAt : NaN)
      // Absent on clients from before the stopwatch.
      const elapsedMs = body?.elapsedMs ?? 0
      const attemptHinted = body?.attemptHinted ?? false
      if (
        !body ||
        !parseCells(body.cells, p) ||
        typeof body.replaying !== 'boolean' ||
        isNaN(updatedAt.getTime()) ||
        !isMs(elapsedMs) ||
        typeof attemptHinted !== 'boolean'
      ) {
        return c.json<ApiError>(
          {
            error: `expected { cells: ${p.width * p.height} of '.#x', replaying: boolean, updatedAt: ISO date, elapsedMs?: ms, attemptHinted?: boolean }`,
          },
          400,
        )
      }

      if (isOwn(c, p)) return c.json<PutProgressResponse>({ applied: false })
      // A client clock running ahead must not lock out every later write.
      const at = new Date(Math.min(updatedAt.getTime(), Date.now()))
      const values = { cells: body.cells as string, replaying: body.replaying, updatedAt: at, elapsedMs, attemptHinted }
      return c.json<PutProgressResponse>({ applied: await upsertProgress(db, c.get('user')!.id, p.id, values) })
    })
    .put('/me/settings', async c => {
      const body = (await c.req.json().catch(() => null)) as { assists?: unknown } | null
      const assists = parseAssists(body?.assists)
      if (!assists) return c.json<ApiError>({ error: `assists must have boolean ${ASSIST_KEYS.join(', ')}` }, 400)
      await db
        .insert(userSettings)
        .values({ userId: c.get('user')!.id, assists })
        .onConflictDoUpdate({ target: userSettings.userId, set: { assists } })
      return c.body(null, 204)
    })
    .post('/me/import', async c => {
      const body = (await c.req.json().catch(() => null)) as { puzzles?: unknown } | null
      const items = body?.puzzles
      if (!Array.isArray(items)) return c.json<ApiError>({ error: 'puzzles must be an array' }, 400)

      const userId = c.get('user')!.id
      const results: Record<string, ImportOutcome> = {}
      const parsed = items.map(parseImportItem)
      const made = await madePuzzlesById(parsed.flatMap(item => (item && !puzzleById(item.id) ? [item.id] : [])))
      await db.transaction(async tx => {
        for (const item of parsed) {
          if (!item) continue
          // Today-only governs play, not import, but a Daily still to come isn't known yet.
          const own = made.get(item.id)
          const found = puzzleById(item.id) ?? (own?.authorId === userId ? undefined : own)
          const p = found && !('date' in found && found.date > latestPlayableDate(now())) ? found : undefined
          const plan = p ? planImport(p, item) : { solve: null, progress: null }
          if (plan.solve) {
            await recordSolve(tx, userId, item.id, plan.solve, false)
            if (item.bestMs !== undefined) await lowerBest(tx, userId, item.id, item.bestMs)
          }
          if (p && item.hinted) await tx.insert(hint).values({ userId, puzzleId: item.id }).onConflictDoNothing()
          // The account's own grid wins over an imported one.
          if (plan.progress) {
            await tx
              .insert(progress)
              .values({
                userId,
                puzzleId: item.id,
                ...plan.progress,
                elapsedMs: item.elapsedMs ?? 0,
                updatedAt: new Date(),
              })
              .onConflictDoNothing()
          }
          results[item.id] = plan.solve ?? (plan.progress ? 'progress' : 'ignored')
        }
      })
      return c.json<ImportResponse>({ results })
    })
}
