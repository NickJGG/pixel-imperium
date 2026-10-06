import { Hono } from 'hono'
import { satisfiesClues } from '@pixel-imperium/nonogram'
import type {
  ApiError,
  Assists,
  GalleryItem,
  HandleAvailability,
  HandleRejection,
  ImportItem,
  ImportOutcome,
  ImportResponse,
  MyProgress,
  Profile,
  PutHandleResponse,
  PutProgressResponse,
  PuzzleClues,
  PuzzleRecord,
  PuzzleSummary,
  SolveResponse,
  SolveStatus,
} from '@pixel-imperium/protocol'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import type { Auth } from './auth.ts'
import type { Db } from './db/index.ts'
import { progress, solve, user, userSettings } from './db/schema.ts'
import { handleProblem } from './handles.ts'
import { parseCells, planImport } from './import.ts'
import type { Puzzle } from './puzzles.ts'

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
  const { id, cells, solved, replaying } = value as Record<string, unknown>
  if (typeof id !== 'string' || typeof solved !== 'boolean' || typeof replaying !== 'boolean') return null
  if (cells !== undefined && typeof cells !== 'string') return null
  return { id, solved, replaying, ...(cells !== undefined && { cells }) }
}

const handleIs = (handle: string) => sql`lower(${user.handle}) = ${handle.toLowerCase()}`

/** Postgres `unique_violation`, which drizzle wraps as the cause of its own error. */
function isUniqueViolation(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === '23505' || (e instanceof Error && isUniqueViolation(e.cause))
}

export function createApp(puzzles: readonly Puzzle[], { db, auth }: AppDeps) {
  const byId = new Map(puzzles.map(p => [p.id, p]))
  const notFound = (id: string): ApiError => ({ error: `no puzzle '${id}'` })

  /** A verified solve upgrades an unverified one; nothing ever downgrades or re-dates a solve. */
  const recordSolve = (tx: Pick<Db, 'insert'>, userId: string, puzzleId: string, status: SolveStatus) => {
    const insert = tx.insert(solve).values({ userId, puzzleId, verified: status === 'verified' })
    return status === 'verified'
      ? insert.onConflictDoUpdate({
          target: [solve.userId, solve.puzzleId],
          set: { verified: true, solvedAt: new Date() },
          setWhere: eq(solve.verified, false),
        })
      : insert.onConflictDoNothing()
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
    .get('/puzzles', c =>
      c.json(
        puzzles.map(
          ({ id, title, width, height, filledCount }): PuzzleSummary => ({ id, title, width, height, filledCount }),
        ),
      ),
    )
    .get('/puzzles/:id', c => {
      const p = byId.get(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)
      const { id, title, width, height, filledCount, clues } = p
      return c.json<PuzzleClues>({ id, title, width, height, filledCount, clues })
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

      const solved = satisfiesClues({ width: p.width, height: p.height, cells }, p.clues)
      const user = c.get('user')
      if (solved && user) await recordSolve(db, user.id, p.id, 'verified')
      return c.json<SolveResponse>(solved ? { solved: true, palette: p.palette } : { solved: false })
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

      const viewer = c.get('user')
      const isOwner = viewer?.id === owner.id
      const [solves, viewerSolves] = await Promise.all([
        db
          .select()
          .from(solve)
          .where(and(eq(solve.userId, owner.id), isOwner ? undefined : eq(solve.verified, true)))
          .orderBy(desc(solve.solvedAt)),
        viewer
          ? db
              .select({ puzzleId: solve.puzzleId })
              .from(solve)
              .where(and(eq(solve.userId, viewer.id), eq(solve.verified, true)))
          : [],
      ])
      // Spoiler rule: a picture is revealed only to viewers who have verifiably solved it themselves.
      const revealed = new Set(viewerSolves.map(s => s.puzzleId))
      const gallery = solves.flatMap((s): GalleryItem[] => {
        const p = byId.get(s.puzzleId)
        if (!p) return []
        const { id, title, width, height } = p
        return [{ puzzleId: id, title, width, height, palette: revealed.has(id) ? p.palette : null, verified: s.verified }]
      })
      return c.json<Profile>({
        handle: owner.handle,
        image: owner.image,
        joinedAt: owner.createdAt.toISOString(),
        verifiedSolves: gallery.filter(g => g.verified).length,
        gallery,
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
      const [solves, grids, [settings]] = await Promise.all([
        db.select().from(solve).where(eq(solve.userId, userId)),
        db.select().from(progress).where(eq(progress.userId, userId)),
        db.select().from(userSettings).where(eq(userSettings.userId, userId)),
      ])
      const records: Record<string, PuzzleRecord> = {}
      const record = (id: string) => (records[id] ??= { solved: null, progress: null, palette: null })
      for (const s of solves) {
        const r = record(s.puzzleId)
        r.solved = s.verified ? 'verified' : 'unverified'
        if (s.verified) r.palette = byId.get(s.puzzleId)?.palette ?? null
      }
      for (const g of grids) {
        record(g.puzzleId).progress = { cells: g.cells, replaying: g.replaying, updatedAt: g.updatedAt.toISOString() }
      }
      return c.json<MyProgress>({ puzzles: records, assists: settings?.assists ?? null })
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
          if (plan.solve) await recordSolve(tx, userId, item.id, plan.solve)
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
