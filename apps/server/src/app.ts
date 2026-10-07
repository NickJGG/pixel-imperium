import { Hono } from 'hono'
import { satisfiesClues } from '@pixel-imperium/nonogram'
import type {
  ApiError,
  Assists,
  Campaign as CampaignPayload,
  CampaignSummary,
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
  SolveStatus,
} from '@pixel-imperium/protocol'
import { and, desc, eq, inArray, lt, sql } from 'drizzle-orm'
import type { Auth } from './auth.ts'
import type { Db } from './db/index.ts'
import { hint, progress, solve, user, userSettings } from './db/schema.ts'
import { handleProblem } from './handles.ts'
import { hintFor, rateLimiter } from './hints.ts'
import { parseCells, planImport } from './import.ts'
import type { Campaign } from './campaigns.ts'

export interface AppDeps {
  db: Db
  auth: Auth
}

type SessionUser = Auth['$Infer']['Session']['user']

const ASSIST_KEYS = ['fadeClues', 'impossibleLines', 'autoMarkEmptyLines', 'crosshair', 'lockLine'] as const

function parseAssists(value: unknown): Assists | null {
  if (!value || typeof value !== 'object') return null
  const assists = Object.fromEntries(ASSIST_KEYS.map(k => [k, (value as Record<string, unknown>)[k]]))
  return Object.values(assists).every(v => typeof v === 'boolean') ? (assists as unknown as Assists) : null
}

function parseImportItem(value: unknown): ImportItem | null {
  if (!value || typeof value !== 'object') return null
  const { id, cells, solved, replaying, hinted } = value as Record<string, unknown>
  if (typeof id !== 'string' || typeof solved !== 'boolean' || typeof replaying !== 'boolean') return null
  if (cells !== undefined && typeof cells !== 'string') return null
  if (hinted !== undefined && typeof hinted !== 'boolean') return null
  return { id, solved, replaying, ...(cells !== undefined && { cells }), ...(hinted && { hinted }) }
}

const SHOWCASE_SIZE = 3

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

const summarize = ({ id, title, width, height, filledCount }: PuzzleSummary): PuzzleSummary => ({
  id,
  title,
  width,
  height,
  filledCount,
})

export function createApp(campaigns: readonly Campaign[], { db, auth }: AppDeps) {
  const byId = new Map(campaigns.flatMap(c => c.provinces.flatMap(p => p.puzzles)).map(p => [p.id, p]))
  const campaignPayloads = new Map(
    campaigns.map(({ id, name, closingLine, journey, provinces }): [string, CampaignPayload] => [
      id,
      {
        id,
        name,
        closingLine,
        journey,
        provinces: provinces.map(({ id, name, theme, flavour, puzzles }) => ({
          id,
          name,
          theme,
          flavour,
          puzzles: puzzles.map(summarize),
        })),
      },
    ]),
  )
  const notFound = (id: string): ApiError => ({ error: `no puzzle '${id}'` })

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

  const hintAllowed = rateLimiter(60, 60_000)

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
        campaigns.map(({ id, name, coverColour }): CampaignSummary => ({ id, name, ...(coverColour && { coverColour }) })),
      ),
    )
    .get('/campaigns/:id', c => {
      const campaign = campaignPayloads.get(c.req.param('id'))
      if (!campaign) return c.json<ApiError>({ error: `no campaign '${c.req.param('id')}'` }, 404)
      return c.json(campaign)
    })
    .get('/puzzles/:id', c => {
      const p = byId.get(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)
      const { campaignId, provinceId, clues } = p
      return c.json<PuzzleClues>({ ...summarize(p), campaignId, provinceId, clues })
    })
    .post('/puzzles/:id/solve', async c => {
      const p = byId.get(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)

      const body: unknown = await c.req.json().catch(() => null)
      const cells = (body as { cells?: unknown } | null)?.cells
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
      if (user) {
        const hinted = await db.$count(hint, and(eq(hint.userId, user.id), eq(hint.puzzleId, p.id)))
        await recordSolve(db, user.id, p.id, 'verified', hinted === 0)
        const [row] = await db
          .select({ foil: solve.foil })
          .from(solve)
          .where(and(eq(solve.userId, user.id), eq(solve.puzzleId, p.id)))
        foil = row!.foil
      }
      return c.json<SolveResponse>({ solved: true, palette: p.palette, foil })
    })
    .post('/puzzles/:id/hint', async c => {
      const p = byId.get(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)
      const user = c.get('user')
      if (!hintAllowed(user?.id ?? c.req.header('x-forwarded-for') ?? 'anonymous')) {
        return c.json<ApiError>({ error: 'too many hints; try again in a minute' }, 429)
      }

      const body = (await c.req.json().catch(() => null)) as { cells?: unknown } | null
      const cells = parseCells(body?.cells, p)
      if (!cells) return c.json<ApiError>({ error: `cells must be ${p.width * p.height} of '.#x'` }, 400)

      const nudge = hintFor(p, cells)
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

      const solves = await db
        .select({ puzzleId: solve.puzzleId, foil: solve.foil })
        .from(solve)
        .where(and(eq(solve.userId, owner.id), eq(solve.verified, true)))
        .orderBy(desc(solve.solvedAt))
      // Insertion order follows the newest solve, so the most recently played campaign comes first.
      const byCampaign = new Map<string, ProfileCampaign>()
      let verifiedSolves = 0
      for (const { puzzleId, foil } of solves) {
        const p = byId.get(puzzleId)
        if (!p) continue
        verifiedSolves++
        const entry = byCampaign.get(p.campaignId) ?? { id: p.campaignId, verifiedPuzzleIds: [], foilPuzzleIds: [] }
        entry.verifiedPuzzleIds.push(puzzleId)
        if (foil) entry.foilPuzzleIds.push(puzzleId)
        byCampaign.set(p.campaignId, entry)
      }
      const verified = new Set(solves.map(s => s.puzzleId))
      return c.json<Profile>({
        handle: owner.handle,
        image: owner.image,
        joinedAt: owner.createdAt.toISOString(),
        verifiedSolves,
        campaigns: [...byCampaign.values()],
        showcase: owner.showcase.filter(id => verified.has(id) && byId.has(id)),
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
      const [solves, grids, hints, [settings], [me]] = await Promise.all([
        db.select().from(solve).where(eq(solve.userId, userId)),
        db.select().from(progress).where(eq(progress.userId, userId)),
        db.select({ puzzleId: hint.puzzleId }).from(hint).where(eq(hint.userId, userId)),
        db.select().from(userSettings).where(eq(userSettings.userId, userId)),
        db.select({ showcase: user.showcase }).from(user).where(eq(user.id, userId)),
      ])
      const records: Record<string, PuzzleRecord> = {}
      const record = (id: string) =>
        (records[id] ??= { solved: null, progress: null, palette: null, foil: false, hinted: false })
      for (const s of solves) {
        const r = record(s.puzzleId)
        r.solved = s.verified ? 'verified' : 'unverified'
        r.foil = s.foil
        if (s.verified) r.palette = byId.get(s.puzzleId)?.palette ?? null
      }
      for (const { puzzleId } of hints) record(puzzleId).hinted = true
      for (const g of grids) {
        record(g.puzzleId).progress = { cells: g.cells, replaying: g.replaying, updatedAt: g.updatedAt.toISOString() }
      }
      const showcase = (me?.showcase ?? []).filter(id => records[id]?.solved === 'verified' && byId.has(id))
      return c.json<MyProgress>({ puzzles: records, assists: settings?.assists ?? null, showcase })
    })
    .put('/me/showcase', async c => {
      const puzzleIds = parseShowcase(await c.req.json().catch(() => null))
      if (!puzzleIds) {
        return c.json<ApiError>({ error: `puzzleIds must be at most ${SHOWCASE_SIZE} distinct puzzle ids` }, 400)
      }
      const userId = c.get('user')!.id
      const known = puzzleIds.every(id => byId.has(id))
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
      const p = byId.get(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)

      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
      const updatedAt = new Date(typeof body?.updatedAt === 'string' ? body.updatedAt : NaN)
      if (!body || !parseCells(body.cells, p) || typeof body.replaying !== 'boolean' || isNaN(updatedAt.getTime())) {
        return c.json<ApiError>(
          { error: `expected { cells: ${p.width * p.height} of '.#x', replaying: boolean, updatedAt: ISO date }` },
          400,
        )
      }

      // A client clock running ahead must not lock out every later write.
      const at = new Date(Math.min(updatedAt.getTime(), Date.now()))
      const values = { cells: body.cells as string, replaying: body.replaying, updatedAt: at }
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
          const p = byId.get(item.id)
          const plan = p ? planImport(p, item) : { solve: null, progress: null }
          if (plan.solve) await recordSolve(tx, userId, item.id, plan.solve, false)
          if (p && item.hinted) await tx.insert(hint).values({ userId, puzzleId: item.id }).onConflictDoNothing()
          // The account's own grid wins over an imported one.
          if (plan.progress) {
            await tx
              .insert(progress)
              .values({ userId, puzzleId: item.id, ...plan.progress, updatedAt: new Date() })
              .onConflictDoNothing()
          }
          results[item.id] = plan.solve ?? (plan.progress ? 'progress' : 'ignored')
        }
      })
      return c.json<ImportResponse>({ results })
    })
}
