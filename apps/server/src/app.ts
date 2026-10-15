import { Hono } from 'hono'
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
  PuzzleRecord,
  PuzzleSummary,
  Showcase,
  SolveResponse,
  SolveStamps,
  SolveStatus,
} from '@pixel-imperium/protocol'
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm'
import type { Auth } from './auth.ts'
import type { Db } from './db/index.ts'
import { hint, lessonDone, progress, solve, user, userSettings } from './db/schema.ts'
import { handleProblem } from './handles.ts'
import { rateLimiter } from './rate-limit.ts'
import { parseCells, planImport } from './import.ts'
import type { Campaign, CampaignPuzzle } from './campaigns.ts'
import {
  type Dailies,
  type DailyPuzzle,
  dailyDate,
  dailyFor,
  datesInMonth,
  isPlayableDate,
  latestPlayableDate,
  yearAlbum,
} from './dailies.ts'
import { type StampSolve, stampProgress, stampsFor } from './stamps.ts'

export interface AppDeps {
  db: Db
  auth: Auth
  /** The clock Dailies are gated by. */
  now?: () => number
}

const NO_DAILIES: Dailies = { launch: '9999-12-31', authored: new Map() }

type SessionUser = Auth['$Infer']['Session']['user']

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

const handleIs = (handle: string) => sql`lower(${user.handle}) = ${handle.toLowerCase()}`

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

export function createApp(
  campaigns: readonly Campaign[],
  { db, auth, now = Date.now }: AppDeps,
  dailies: Dailies = NO_DAILIES,
) {
  const byId = new Map(campaigns.flatMap(c => c.provinces.flatMap(p => p.puzzles)).map(p => [p.id, p]))
  /** A campaign puzzle, or a Daily by its `daily:<date>` id, whatever its date. */
  const puzzleById = (id: string): CampaignPuzzle | DailyPuzzle | undefined => {
    const date = dailyDate(id)
    return date === null ? byId.get(id) : (dailyFor(dailies, date) ?? undefined)
  }
  /** Like `puzzleById`, but a Daily only while its date is "today" somewhere. */
  const playable = (id: string) => {
    const p = puzzleById(id)
    return p && (!('date' in p) || isPlayableDate(p.date, now())) ? p : undefined
  }
  const campaignPayloads = new Map(
    campaigns.map(({ id, name, released, paper, closingLine, crest, provinces }): [string, CampaignPayload] => [
      id,
      {
        id,
        name,
        ...(released && { released }),
        paper,
        closingLine,
        ...(crest && { crest: { width: crest.width, height: crest.height } }),
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
  const campaignsById = new Map(campaigns.map(c => [c.id, c]))
  const crestColor = (puzzleId: string) => {
    const p = byId.get(puzzleId)
    return p && campaignsById.get(p.campaignId)?.crest?.color.get(puzzleId)
  }
  const notFound = (id: string): ApiError =>
    dailyDate(id) === null ? { error: `no puzzle '${id}'` } : { error: `no Daily '${id}' to play today` }

  /**
   * A verified solve upgrades an unverified one; nothing ever downgrades or re-dates a solve.
   * `foil` counts only for the first solve, so an upgrade never makes one foil.
   */
  const recordSolve = (tx: Pick<Db, 'insert'>, userId: string, puzzleId: string, status: SolveStatus, foil: boolean) => {
    const insert = tx.insert(solve).values({ userId, puzzleId, verified: status === 'verified', foil })
    return status === 'verified'
      ? insert.onConflictDoUpdate({
          target: [solve.userId, solve.puzzleId],
          set: { verified: true, solvedAt: new Date() },
          setWhere: eq(solve.verified, false),
        })
      : insert.onConflictDoNothing()
  }

  /** Apart from `recordSolve`, whose upsert leaves a verified row untouched. Postgres' `least` skips a null. */
  const lowerBest = (tx: Pick<Db, 'update'>, userId: string, puzzleId: string, ms: number) =>
    tx
      .update(solve)
      .set({ bestMs: sql`least(${solve.bestMs}, ${ms})` })
      .where(and(eq(solve.userId, userId), eq(solve.puzzleId, puzzleId)))

  const hintAllowed = rateLimiter(60, 60_000)

  const verifiedSolvesOf = (userId: string) =>
    db
      .select({ puzzleId: solve.puzzleId, foil: solve.foil, solvedAt: solve.solvedAt })
      .from(solve)
      .where(and(eq(solve.userId, userId), eq(solve.verified, true)))
      .orderBy(desc(solve.solvedAt))

  /** What a newly verified solve of `p` earned, and what it brings near; earns nothing when it was verified already. */
  const solveStamps = async (userId: string, p: CampaignPuzzle | DailyPuzzle, fresh: boolean): Promise<SolveStamps> => {
    const solves = await verifiedSolvesOf(userId)
    const [album, options] =
      'date' in p
        ? [yearAlbum(dailies.launch, Number(p.date.slice(0, 4))), { year: true }]
        : [campaignsById.get(p.campaignId)!, {}]
    const ids = (list: readonly StampSolve[]) => stampsFor(album, list, options).map(s => s.id)
    const before = new Set(fresh ? ids(solves.filter(s => s.puzzleId !== p.id)) : [])
    return {
      earned: fresh ? ids(solves).filter(id => !before.has(id)) : [],
      near: stampProgress(album, solves, p.id, options),
    }
  }

  return new Hono<{ Variables: { user: SessionUser | null } }>()
    .basePath('/api')
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
    .get('/campaigns/:id', c => {
      const campaign = campaignPayloads.get(c.req.param('id'))
      if (!campaign) return c.json<ApiError>({ error: `no campaign '${c.req.param('id')}'` }, 404)
      return c.json(campaign)
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
    .get('/puzzles/:id', c => {
      const p = playable(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)
      const context = 'date' in p ? { daily: p.date } : { campaignId: p.campaignId, provinceId: p.provinceId }
      return c.json<PuzzleClues>({ ...summarize(p), ...context, clues: p.clues })
    })
    .post('/puzzles/:id/solve', async c => {
      const p = playable(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)

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
      const user = c.get('user')
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
        stamps = await solveStamps(user.id, p, recorded.length > 0)
      }
      const crest = crestColor(p.id)
      return c.json<SolveResponse>({ solved: true, palette: p.palette, foil, ...(crest && { crest }), ...(stamps && { stamps }) })
    })
    .post('/puzzles/:id/hint', async c => {
      const p = playable(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)
      const user = c.get('user')
      if (!hintAllowed(user?.id ?? c.req.header('x-forwarded-for') ?? 'anonymous')) {
        return c.json<ApiError>({ error: 'too many hints; try again in a minute' }, 429)
      }

      const body = (await c.req.json().catch(() => null)) as { cells?: unknown } | null
      const cells = parseCells(body?.cells, p)
      if (!cells) return c.json<ApiError>({ error: `cells must be ${p.width * p.height} of '.#x'` }, 400)

      const nudge = hintFor(p.palette, cells)
      if (!nudge) return c.json<ApiError>({ error: 'nothing to hint: the grid is solved' }, 409)
      if (user) await db.insert(hint).values({ userId: user.id, puzzleId: p.id }).onConflictDoNothing()
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
      return c.json<Profile>({
        handle: owner.handle,
        image: owner.image,
        joinedAt: owner.createdAt.toISOString(),
        verifiedSolves,
        campaigns: [...byCampaign.values()],
        years: [...byYear.values()],
        showcase: owner.showcase.filter(id => verified.has(id) && puzzleById(id)),
      })
    })
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
      for (const s of solves) {
        const r = record(s.puzzleId)
        r.solved = s.verified ? 'verified' : 'unverified'
        r.foil = s.foil
        r.bestMs = s.bestMs
        if (s.verified) {
          r.palette = puzzleById(s.puzzleId)?.palette ?? null
          r.crest = crestColor(s.puzzleId) ?? null
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
      const p = playable(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)

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

      // A client clock running ahead must not lock out every later write.
      const at = new Date(Math.min(updatedAt.getTime(), Date.now()))
      const values = { cells: body.cells as string, replaying: body.replaying, updatedAt: at, elapsedMs, attemptHinted }
      const applied = await db
        .insert(progress)
        .values({ userId: c.get('user')!.id, puzzleId: p.id, ...values })
        .onConflictDoUpdate({
          target: [progress.userId, progress.puzzleId],
          set: values,
          setWhere: lt(progress.updatedAt, at),
        })
        .returning({ puzzleId: progress.puzzleId })
      return c.json<PutProgressResponse>({ applied: applied.length > 0 })
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
      await db.transaction(async tx => {
        for (const raw of items) {
          const item = parseImportItem(raw)
          if (!item) continue
          // Today-only governs play, not import, but a Daily still to come isn't known yet.
          const found = puzzleById(item.id)
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
