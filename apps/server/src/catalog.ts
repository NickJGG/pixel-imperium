/** Every puzzle the server knows, who may play it, and how its solves and grids are written; shared by the API and parties. */
import type { ApiError, RetiredError, SolveStamps, SolveStatus } from '@pixel-imperium/protocol'
import { and, desc, eq, lt, sql } from 'drizzle-orm'
import type { Db } from './db/index.ts'
import { progress, solve } from './db/schema.ts'
import type { Campaign, CampaignPuzzle } from './campaigns.ts'
import { type Dailies, type DailyPuzzle, dailyDate, dailyFor, isPlayableDate, yearAlbum } from './dailies.ts'
import { type StampSolve, stampProgress, stampsFor } from './stamps.ts'
import { type MadePuzzle, hasStarted, loadMadePuzzle, madeCrest } from './made.ts'

export type Found = CampaignPuzzle | DailyPuzzle | MadePuzzle

/** A puzzle a request may play, or why not: unknown or taken down (404), or retired before this player started it (410). */
export type Lookup = { puzzle: Found } | { status: 404 | 410; error: ApiError | RetiredError }

/** Who is asking: an Account, or a signed-out device that may say it has progress (`?started=1`). */
export interface Viewer {
  userId: string | null
  started: boolean
}

export const NO_DAILIES: Dailies = { launch: '9999-12-31', authored: new Map() }

export function createCatalog(
  campaigns: readonly Campaign[],
  { db, now = Date.now }: { db: Db; now?: () => number },
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
  const campaignsById = new Map(campaigns.map(c => [c.id, c]))
  const crestColor = (puzzleId: string) => {
    const p = byId.get(puzzleId)
    return p && campaignsById.get(p.campaignId)?.crest?.color.get(puzzleId)
  }
  const notFound = (id: string): ApiError =>
    dailyDate(id) === null ? { error: `no puzzle '${id}'` } : { error: `no Daily '${id}' to play today` }

  /** Its Author, a signed-in player with a grid or solve on it, or a signed-out device saying it has progress. */
  const mayPlayRetired = async (viewer: Viewer, authorId: string, startedIds: readonly string[]) =>
    viewer.userId === null ? viewer.started : viewer.userId === authorId || hasStarted(db, viewer.userId, startedIds)
  const retiredError = (author: string): RetiredError => ({ error: `@${author} retired this`, retired: true, author })

  /** `playable`, falling back to published player-made puzzles. */
  const findPuzzle = async (viewer: Viewer, id: string): Promise<Lookup> => {
    const official = playable(id)
    if (official) return { puzzle: official }
    const made = await loadMadePuzzle(db, id)
    if (!made) return { status: 404, error: notFound(id) }
    if (made.made.retired && !(await mayPlayRetired(viewer, made.authorId, made.startedIds))) {
      return { status: 410, error: retiredError(made.made.author) }
    }
    return { puzzle: made }
  }

  /** A solved puzzle's Crest pixel color, if its campaign has a Crest. */
  const crestOf = (p: Found) => ('made' in p ? p.campaign && madeCrest(p.campaign)?.color.get(p.id) : crestColor(p.id))

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

  return {
    campaigns,
    dailies,
    byId,
    campaignsById,
    puzzleById,
    findPuzzle,
    mayPlayRetired,
    retiredError,
    isOwn: (userId: string | null, p: Found) => 'made' in p && userId === p.authorId,
    isOfficialId: (id: string) => byId.has(id) || campaignsById.has(id),
    crestOf,
    recordSolve,
    lowerBest,
    verifiedSolvesOf,
    solveStamps,
  }
}

export type Catalog = ReturnType<typeof createCatalog>

export interface ProgressWrite {
  cells: string
  replaying: boolean
  updatedAt: Date
  elapsedMs?: number
  attemptHinted?: boolean
}

/** Keeps the grid only if it is newer than the stored one; whether it was kept. Fields left out stay as stored. */
export async function upsertProgress(db: Pick<Db, 'insert'>, userId: string, puzzleId: string, values: ProgressWrite) {
  const applied = await db
    .insert(progress)
    .values({ userId, puzzleId, ...values })
    .onConflictDoUpdate({
      target: [progress.userId, progress.puzzleId],
      set: values,
      setWhere: lt(progress.updatedAt, values.updatedAt),
    })
    .returning({ puzzleId: progress.puzzleId })
  return applied.length > 0
}
