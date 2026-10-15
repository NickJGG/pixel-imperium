/** The Workshop's API: drafts, publishing, the Author's published work, what a player played by link, and reports. */
import { Hono } from 'hono'
import type {
  ApiError,
  DeleteRejection,
  DraftCampaign,
  DraftPuzzle,
  Drafts,
  HexPaper,
  Made,
  MadeCampaignSummary,
  MadeProvince,
  MadePuzzleSummary,
  Played,
  PlayedCampaign,
  PlayedPuzzle,
  PublishRejection,
  PublishResponse,
  PutDraftCampaignResponse,
  PutDraftPuzzleResponse,
} from '@pixel-imperium/protocol'
import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm'
import type { AppEnv } from './app.ts'
import type { Db } from './db/index.ts'
import { draftCampaign, draftPuzzle, madeCampaign, madePuzzle, progress, report, solve, user } from './db/schema.ts'
import {
  DAILY_CAMPAIGN_PUBLISHES,
  DAILY_PUZZLE_PUBLISHES,
  DRAFT_CAMPAIGN_CAP,
  DRAFT_ID,
  DRAFT_PUZZLE_CAP,
  type MadeCampaignRow,
  draftChecks,
  isHexPaper,
  isMadeId,
  newMadeId,
  othersStarted,
  parseCampaignDoc,
  parseDraftPuzzle,
  previewOf,
  resolveRefs,
  seedOf,
} from './made.ts'
import { parseSeedPuzzle } from './puzzles.ts'
import { rateLimiter } from './rate-limit.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_TITLE = 80
const MAX_FLAVOUR = 200
const MAX_REASON = 500

const titleOr = (title: string, fallback: string) => title.trim() || fallback

/** A client clock running ahead must not lock out every later write. */
const clamp = (at: Date) => new Date(Math.min(at.getTime(), Date.now()))

class Conflict extends Error {}

export function workshopRoutes({ db, isOfficialId }: { db: Db; isOfficialId: (id: string) => boolean }) {
  const reportAllowed = rateLimiter(10, 60 * 60 * 1000)

  const isBanned = async (userId: string) => {
    const [me] = await db.select({ banned: user.publishBannedAt }).from(user).where(eq(user.id, userId))
    return !!me?.banned
  }

  const draftCampaignOf = async (userId: string, id: string) => {
    const [row] = await db
      .select()
      .from(draftCampaign)
      .where(and(eq(draftCampaign.userId, userId), eq(draftCampaign.id, id)))
    return row
  }

  const withPreview = async (userId: string, row: typeof draftCampaign.$inferSelect): Promise<DraftCampaign> => {
    const refs = row.doc.provinces.flatMap(p => p.puzzleIds)
    return {
      id: row.id,
      doc: row.doc,
      updatedAt: row.updatedAt.toISOString(),
      preview: previewOf(row.doc, await resolveRefs(db, userId, refs)),
    }
  }

  const ownPuzzle = async (userId: string, id: string) => {
    const [row] = await db
      .select()
      .from(madePuzzle)
      .where(and(eq(madePuzzle.id, id), eq(madePuzzle.authorId, userId), isNull(madePuzzle.removedAt)))
    return row
  }

  const ownCampaign = async (userId: string, id: string) => {
    const [row] = await db
      .select()
      .from(madeCampaign)
      .where(and(eq(madeCampaign.id, id), eq(madeCampaign.authorId, userId), isNull(madeCampaign.removedAt)))
    return row
  }

  const campaignPuzzleIds = (c: Pick<MadeCampaignRow, 'provinces'>) => c.provinces.flatMap(p => p.puzzleIds)

  const notYours = (kind: string, id: string) => ({ error: `no ${kind} '${id}' of yours` })

  return new Hono<AppEnv>()
    .get('/me/drafts', async c => {
      const userId = c.get('user')!.id
      const [puzzles, campaigns] = await Promise.all([
        db
          .select({
            id: draftPuzzle.id,
            title: draftPuzzle.title,
            width: draftPuzzle.width,
            height: draftPuzzle.height,
            paper: draftPuzzle.paper,
            updatedAt: draftPuzzle.updatedAt,
          })
          .from(draftPuzzle)
          .where(eq(draftPuzzle.userId, userId))
          .orderBy(desc(draftPuzzle.updatedAt)),
        db.select().from(draftCampaign).where(eq(draftCampaign.userId, userId)).orderBy(desc(draftCampaign.updatedAt)),
      ])
      return c.json<Drafts>({
        puzzles: puzzles.map(p => ({ ...p, paper: p.paper as HexPaper | null, updatedAt: p.updatedAt.toISOString() })),
        campaigns: campaigns.map(d => ({ id: d.id, title: d.doc.title, paper: d.doc.paper, updatedAt: d.updatedAt.toISOString() })),
      })
    })
    .get('/me/drafts/puzzles/:id', async c => {
      const [row] = await db
        .select()
        .from(draftPuzzle)
        .where(and(eq(draftPuzzle.userId, c.get('user')!.id), eq(draftPuzzle.id, c.req.param('id'))))
      if (!row) return c.json<ApiError>(notYours('draft', c.req.param('id')), 404)
      const { userId: _, ...draft } = row
      return c.json<DraftPuzzle>({ ...draft, paper: draft.paper as HexPaper | null, updatedAt: draft.updatedAt.toISOString() })
    })
    .put('/me/drafts/puzzles/:id', async c => {
      const id = c.req.param('id')
      if (!DRAFT_ID.test(id)) return c.json<ApiError>({ error: 'draft ids are 1–64 of A-Z a-z 0-9 _ -' }, 400)
      const draft = parseDraftPuzzle(await c.req.json().catch(() => null))
      if (!draft) {
        return c.json<ApiError>(
          {
            error:
              'expected { title, width, height: 1–30, cells: width × height of null or a strip color, colors: hex[], paper: hex | null, updatedAt: ISO date }',
          },
          400,
        )
      }
      const userId = c.get('user')!.id
      const mine = and(eq(draftPuzzle.userId, userId), eq(draftPuzzle.id, id))
      if ((await db.$count(draftPuzzle, mine)) === 0 && (await db.$count(draftPuzzle, eq(draftPuzzle.userId, userId))) >= DRAFT_PUZZLE_CAP) {
        return c.json<ApiError>({ error: `at most ${DRAFT_PUZZLE_CAP} draft puzzles` }, 409)
      }
      const values = { ...draft, updatedAt: clamp(draft.updatedAt) }
      const applied = await db
        .insert(draftPuzzle)
        .values({ userId, id, ...values })
        .onConflictDoUpdate({
          target: [draftPuzzle.userId, draftPuzzle.id],
          set: values,
          setWhere: lt(draftPuzzle.updatedAt, values.updatedAt),
        })
        .returning({ id: draftPuzzle.id })
      return c.json<PutDraftPuzzleResponse>({ applied: applied.length > 0 })
    })
    .delete('/me/drafts/puzzles/:id', async c => {
      await db.delete(draftPuzzle).where(and(eq(draftPuzzle.userId, c.get('user')!.id), eq(draftPuzzle.id, c.req.param('id'))))
      return c.body(null, 204)
    })
    .post('/me/drafts/puzzles/:id/publish', async c => {
      const userId = c.get('user')!.id
      if (await isBanned(userId)) return c.json<ApiError>({ error: 'you can no longer publish' }, 403)
      const [draft] = await db
        .select()
        .from(draftPuzzle)
        .where(and(eq(draftPuzzle.userId, userId), eq(draftPuzzle.id, c.req.param('id'))))
      if (!draft) return c.json<ApiError>(notYours('draft', c.req.param('id')), 404)

      const body = ((await c.req.json().catch(() => null)) ?? {}) as { title?: unknown; paper?: unknown }
      if (body.title !== undefined && !(typeof body.title === 'string' && body.title.length <= MAX_TITLE)) {
        return c.json<ApiError>({ error: `title must be at most ${MAX_TITLE} characters` }, 400)
      }
      if (body.paper !== undefined && body.paper !== null && !isHexPaper(body.paper)) {
        return c.json<ApiError>({ error: 'paper must be a #rrggbb hex or null' }, 400)
      }
      const recent = await db.$count(
        madePuzzle,
        and(eq(madePuzzle.authorId, userId), isNull(madePuzzle.campaignId), gt(madePuzzle.createdAt, new Date(Date.now() - DAY_MS))),
      )
      if (recent >= DAILY_PUZZLE_PUBLISHES) {
        return c.json<ApiError>({ error: `at most ${DAILY_PUZZLE_PUBLISHES} puzzles a day` }, 429)
      }
      const { checks, ok } = draftChecks(draft)
      if (!ok) return c.json<PublishRejection>({ error: 'the puzzle breaks a publish rule' }, 422)

      const title = titleOr(typeof body.title === 'string' ? body.title : draft.title, 'Untitled')
      const paper = body.paper === undefined ? draft.paper : body.paper
      const id = await db.transaction(async tx => {
        const id = await newMadeId(tx, isOfficialId)
        await tx.insert(madePuzzle).values({
          id,
          authorId: userId,
          title,
          seed: seedOf({ ...draft, title }, id),
          paper,
          passes: checks.passes!,
          draftId: draft.id,
        })
        await tx.delete(draftPuzzle).where(and(eq(draftPuzzle.userId, userId), eq(draftPuzzle.id, draft.id)))
        return id
      })
      return c.json<PublishResponse>({ id }, 201)
    })
    .get('/me/drafts/campaigns/:id', async c => {
      const userId = c.get('user')!.id
      const row = await draftCampaignOf(userId, c.req.param('id'))
      if (!row) return c.json<ApiError>(notYours('draft', c.req.param('id')), 404)
      return c.json<DraftCampaign>(await withPreview(userId, row))
    })
    .put('/me/drafts/campaigns/:id', async c => {
      const id = c.req.param('id')
      if (!DRAFT_ID.test(id)) return c.json<ApiError>({ error: 'draft ids are 1–64 of A-Z a-z 0-9 _ -' }, 400)
      const body = (await c.req.json().catch(() => null)) as { doc?: unknown; updatedAt?: unknown } | null
      const doc = parseCampaignDoc(body?.doc)
      const updatedAt = new Date(typeof body?.updatedAt === 'string' ? body.updatedAt : NaN)
      if (!doc || isNaN(updatedAt.getTime())) {
        return c.json<ApiError>({ error: 'expected { doc: DraftCampaignDoc, updatedAt: ISO date }' }, 400)
      }
      const userId = c.get('user')!.id
      const mine = and(eq(draftCampaign.userId, userId), eq(draftCampaign.id, id))
      if ((await db.$count(draftCampaign, mine)) === 0 && (await db.$count(draftCampaign, eq(draftCampaign.userId, userId))) >= DRAFT_CAMPAIGN_CAP) {
        return c.json<ApiError>({ error: `at most ${DRAFT_CAMPAIGN_CAP} draft campaigns` }, 409)
      }
      const values = { doc, updatedAt: clamp(updatedAt) }
      const applied = await db
        .insert(draftCampaign)
        .values({ userId, id, ...values })
        .onConflictDoUpdate({
          target: [draftCampaign.userId, draftCampaign.id],
          set: values,
          setWhere: lt(draftCampaign.updatedAt, values.updatedAt),
        })
        .returning({ id: draftCampaign.id })
      const { preview } = await withPreview(userId, (await draftCampaignOf(userId, id))!)
      return c.json<PutDraftCampaignResponse>({ applied: applied.length > 0, preview })
    })
    .delete('/me/drafts/campaigns/:id', async c => {
      await db
        .delete(draftCampaign)
        .where(and(eq(draftCampaign.userId, c.get('user')!.id), eq(draftCampaign.id, c.req.param('id'))))
      return c.body(null, 204)
    })
    .post('/me/drafts/campaigns/:id/publish', async c => {
      const userId = c.get('user')!.id
      if (await isBanned(userId)) return c.json<ApiError>({ error: 'you can no longer publish' }, 403)
      const row = await draftCampaignOf(userId, c.req.param('id'))
      if (!row) return c.json<ApiError>(notYours('draft', c.req.param('id')), 404)
      const recent = await db.$count(
        madeCampaign,
        and(eq(madeCampaign.authorId, userId), gt(madeCampaign.createdAt, new Date(Date.now() - DAY_MS))),
      )
      if (recent >= DAILY_CAMPAIGN_PUBLISHES) {
        return c.json<ApiError>({ error: `at most ${DAILY_CAMPAIGN_PUBLISHES} campaigns a day` }, 429)
      }

      const { doc } = row
      const paper = doc.paper
      if (!paper) return c.json<PublishRejection>({ error: 'the campaign needs a paper' }, 422)
      if (doc.provinces.length === 0 || doc.provinces.some(p => p.puzzleIds.length === 0)) {
        return c.json<PublishRejection>({ error: 'every province needs a puzzle' }, 422)
      }
      const resolved = await resolveRefs(db, userId, doc.provinces.flatMap(p => p.puzzleIds))
      const preview = previewOf(doc, resolved)
      if (preview.provinces.some(p => p.puzzles.some(q => q.problem))) {
        return c.json<PublishRejection>({ error: 'a puzzle is missing, taken or breaks a publish rule', preview }, 422)
      }

      try {
        const id = await db.transaction(async tx => {
          const id = await newMadeId(tx, isOfficialId)
          const usedDrafts: string[] = []
          const provinces: MadeProvince[] = []
          for (const [k, province] of doc.provinces.entries()) {
            const puzzleIds: string[] = []
            for (const ref of province.puzzleIds) {
              const r = resolved.get(ref)!
              if ('made' in r) {
                const joined = await tx
                  .update(madePuzzle)
                  .set({ campaignId: id })
                  .where(and(eq(madePuzzle.id, r.made.id), isNull(madePuzzle.campaignId), isNull(madePuzzle.retiredAt)))
                  .returning({ id: madePuzzle.id })
                if (joined.length === 0) throw new Conflict()
                puzzleIds.push(r.made.id)
                continue
              }
              const puzzleId = await newMadeId(tx, isOfficialId)
              const title = titleOr(r.draft.title, 'Untitled')
              await tx.insert(madePuzzle).values({
                id: puzzleId,
                authorId: userId,
                title,
                seed: seedOf({ ...r.draft, title }, puzzleId),
                paper: r.draft.paper,
                passes: draftChecks(r.draft).checks.passes!,
                campaignId: id,
                draftId: r.draft.id,
              })
              usedDrafts.push(r.draft.id)
              puzzleIds.push(puzzleId)
            }
            const { name, flavour, paper } = province
            provinces.push({ name: titleOr(name, `Province ${k + 1}`), flavour, paper, puzzleIds, tiers: preview.provinces[k]!.tiers })
          }
          await tx.insert(madeCampaign).values({
            id,
            authorId: userId,
            title: titleOr(doc.title, 'Untitled campaign'),
            paper,
            provinces,
            // A crest that no longer fits its puzzles is dropped rather than blocking the publish.
            crest: preview.crest?.fits ? doc.crest : null,
          })
          if (usedDrafts.length > 0) {
            await tx.delete(draftPuzzle).where(and(eq(draftPuzzle.userId, userId), inArray(draftPuzzle.id, usedDrafts)))
          }
          await tx.delete(draftCampaign).where(and(eq(draftCampaign.userId, userId), eq(draftCampaign.id, row.id)))
          return id
        })
        return c.json<PublishResponse>({ id }, 201)
      } catch (e) {
        if (!(e instanceof Conflict)) throw e
        return c.json<ApiError>({ error: 'a puzzle joined another campaign meanwhile' }, 409)
      }
    })
    .get('/me/made', async c => {
      const userId = c.get('user')!.id
      const [puzzles, campaigns] = await Promise.all([
        db.select().from(madePuzzle).where(eq(madePuzzle.authorId, userId)).orderBy(desc(madePuzzle.createdAt)),
        db.select().from(madeCampaign).where(eq(madeCampaign.authorId, userId)).orderBy(desc(madeCampaign.createdAt)),
      ])
      return c.json<Made>({
        puzzles: puzzles.map((row): MadePuzzleSummary => {
          const { width, height, filledCount, palette } = parseSeedPuzzle(row.seed)
          return {
            id: row.id,
            title: row.title,
            width,
            height,
            filledCount,
            palette,
            paper: row.paper as HexPaper | null,
            campaignId: row.campaignId,
            createdAt: row.createdAt.toISOString(),
            ...(row.retiredAt && { retired: true }),
            ...(row.removedAt && { removed: true }),
          }
        }),
        campaigns: campaigns.map(
          (row): MadeCampaignSummary => ({
            id: row.id,
            title: row.title,
            paper: row.paper as HexPaper,
            total: campaignPuzzleIds(row).length,
            createdAt: row.createdAt.toISOString(),
            ...(row.retiredAt && { retired: true }),
            ...(row.removedAt && { removed: true }),
          }),
        ),
      })
    })
    .patch('/me/made/puzzles/:id', async c => {
      const body = (await c.req.json().catch(() => null)) as { title?: unknown; paper?: unknown } | null
      const { title, paper } = body ?? {}
      if (
        !body ||
        (title !== undefined && !(typeof title === 'string' && title.trim() && title.length <= MAX_TITLE)) ||
        (paper !== undefined && paper !== null && !isHexPaper(paper))
      ) {
        return c.json<ApiError>({ error: `expected { title?: 1–${MAX_TITLE} characters, paper?: hex | null }` }, 400)
      }
      const updated = await db
        .update(madePuzzle)
        .set({ ...(typeof title === 'string' && { title: title.trim() }), ...(paper !== undefined && { paper }) })
        .where(and(eq(madePuzzle.id, c.req.param('id')), eq(madePuzzle.authorId, c.get('user')!.id), isNull(madePuzzle.removedAt)))
        .returning({ id: madePuzzle.id })
      if (updated.length === 0) return c.json<ApiError>(notYours('puzzle', c.req.param('id')), 404)
      return c.body(null, 204)
    })
    .post('/me/made/puzzles/:id/retire', async c => {
      const row = await ownPuzzle(c.get('user')!.id, c.req.param('id'))
      if (!row) return c.json<ApiError>(notYours('puzzle', c.req.param('id')), 404)
      if (row.campaignId) return c.json<ApiError>({ error: 'it is in a campaign; retire the campaign' }, 409)
      await db
        .update(madePuzzle)
        .set({ retiredAt: new Date() })
        .where(and(eq(madePuzzle.id, row.id), isNull(madePuzzle.retiredAt)))
      return c.body(null, 204)
    })
    .delete('/me/made/puzzles/:id', async c => {
      const userId = c.get('user')!.id
      const row = await ownPuzzle(userId, c.req.param('id'))
      if (!row) return c.json<ApiError>(notYours('puzzle', c.req.param('id')), 404)
      if (row.campaignId) return c.json<ApiError>({ error: 'it is in a campaign' }, 409)
      if (await othersStarted(db, userId, [row.id])) {
        return c.json<DeleteRejection>({ error: 'others have started it; retire it instead', retire: true }, 409)
      }
      await db.delete(madePuzzle).where(eq(madePuzzle.id, row.id))
      return c.body(null, 204)
    })
    .patch('/me/made/campaigns/:id', async c => {
      const row = await ownCampaign(c.get('user')!.id, c.req.param('id'))
      if (!row) return c.json<ApiError>(notYours('campaign', c.req.param('id')), 404)
      const body = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
      const { title, paper, provinces } = body ?? {}
      const isProvince = (p: unknown) => {
        const { name, flavour, paper } = (p ?? {}) as Record<string, unknown>
        return (
          typeof name === 'string' &&
          !!name.trim() &&
          name.length <= MAX_TITLE &&
          typeof flavour === 'string' &&
          flavour.length <= MAX_FLAVOUR &&
          (paper === null || isHexPaper(paper))
        )
      }
      if (
        !body ||
        (title !== undefined && !(typeof title === 'string' && title.trim() && title.length <= MAX_TITLE)) ||
        (paper !== undefined && !isHexPaper(paper)) ||
        (provinces !== undefined &&
          !(Array.isArray(provinces) && provinces.length === row.provinces.length && provinces.every(isProvince)))
      ) {
        return c.json<ApiError>(
          {
            error: `expected { title?, paper?: hex, provinces?: ${row.provinces.length} of { name, flavour, paper: hex | null } }`,
          },
          400,
        )
      }
      const texts = provinces as { name: string; flavour: string; paper: HexPaper | null }[] | undefined
      await db
        .update(madeCampaign)
        .set({
          ...(typeof title === 'string' && { title: title.trim() }),
          ...(paper !== undefined && { paper: paper as HexPaper }),
          ...(texts && {
            provinces: row.provinces.map((p, k) => ({ ...p, name: texts[k]!.name.trim(), flavour: texts[k]!.flavour, paper: texts[k]!.paper })),
          }),
        })
        .where(eq(madeCampaign.id, row.id))
      return c.body(null, 204)
    })
    .post('/me/made/campaigns/:id/retire', async c => {
      const row = await ownCampaign(c.get('user')!.id, c.req.param('id'))
      if (!row) return c.json<ApiError>(notYours('campaign', c.req.param('id')), 404)
      await db
        .update(madeCampaign)
        .set({ retiredAt: new Date() })
        .where(and(eq(madeCampaign.id, row.id), isNull(madeCampaign.retiredAt)))
      return c.body(null, 204)
    })
    .delete('/me/made/campaigns/:id', async c => {
      const userId = c.get('user')!.id
      const row = await ownCampaign(userId, c.req.param('id'))
      if (!row) return c.json<ApiError>(notYours('campaign', c.req.param('id')), 404)
      if (await othersStarted(db, userId, campaignPuzzleIds(row))) {
        return c.json<DeleteRejection>({ error: 'others have started it; retire it instead', retire: true }, 409)
      }
      // Its puzzles stay published, back on their own.
      await db.transaction(async tx => {
        await tx.update(madePuzzle).set({ campaignId: null }).where(eq(madePuzzle.campaignId, row.id))
        await tx.delete(madeCampaign).where(eq(madeCampaign.id, row.id))
      })
      return c.body(null, 204)
    })
    .get('/me/played', async c => {
      const userId = c.get('user')!.id
      const [grids, solves] = await Promise.all([
        db.select({ id: progress.puzzleId, at: progress.updatedAt }).from(progress).where(eq(progress.userId, userId)),
        db
          .select({ id: solve.puzzleId, at: solve.solvedAt, verified: solve.verified })
          .from(solve)
          .where(eq(solve.userId, userId)),
      ])
      const lastPlayed = new Map<string, number>()
      for (const { id, at } of [...grids, ...solves]) {
        if (isMadeId(id)) lastPlayed.set(id, Math.max(lastPlayed.get(id) ?? 0, at.getTime()))
      }
      const verified = new Set(solves.filter(s => s.verified).map(s => s.id))
      const ids = [...lastPlayed.keys()]
      const rows =
        ids.length === 0
          ? []
          : await db
              .select({ puzzle: madePuzzle, author: user.handle })
              .from(madePuzzle)
              .innerJoin(user, eq(user.id, madePuzzle.authorId))
              .where(and(inArray(madePuzzle.id, ids), ne(madePuzzle.authorId, userId)))

      const puzzles: (PlayedPuzzle & { at: number })[] = []
      const campaignAt = new Map<string, number>()
      for (const { puzzle: p, author } of rows) {
        const at = lastPlayed.get(p.id)!
        if (p.campaignId) {
          campaignAt.set(p.campaignId, Math.max(campaignAt.get(p.campaignId) ?? 0, at))
          continue
        }
        const { width, height, filledCount } = parseSeedPuzzle(p.seed)
        puzzles.push({
          id: p.id,
          title: p.removedAt ? '' : p.title,
          width,
          height,
          filledCount,
          author,
          paper: p.paper as HexPaper | null,
          solved: verified.has(p.id),
          at,
          ...(p.retiredAt && { retired: true }),
          ...(p.removedAt && { removed: true }),
        })
      }
      const campaignRows =
        campaignAt.size === 0
          ? []
          : await db
              .select({ campaign: madeCampaign, author: user.handle })
              .from(madeCampaign)
              .innerJoin(user, eq(user.id, madeCampaign.authorId))
              .where(inArray(madeCampaign.id, [...campaignAt.keys()]))
      const campaigns = campaignRows.map(({ campaign: row, author }): PlayedCampaign & { at: number } => {
        const ids = campaignPuzzleIds(row)
        return {
          id: row.id,
          title: row.removedAt ? '' : row.title,
          author,
          paper: row.paper as HexPaper,
          total: ids.length,
          solved: ids.filter(id => verified.has(id)).length,
          at: campaignAt.get(row.id)!,
          ...(row.retiredAt && { retired: true }),
          ...(row.removedAt && { removed: true }),
        }
      })
      const newestFirst = <T extends { at: number }>(list: T[]) => list.sort((a, b) => b.at - a.at).map(({ at: _, ...rest }) => rest)
      return c.json<Played>({ puzzles: newestFirst(puzzles), campaigns: newestFirst(campaigns) })
    })
    .post('/reports', async c => {
      const viewer = c.get('user')
      const ip = c.req.header('x-forwarded-for') ?? null
      if (!reportAllowed(viewer?.id ?? ip ?? 'anonymous')) {
        return c.json<ApiError>({ error: 'too many reports; try again later' }, 429)
      }
      const body = (await c.req.json().catch(() => null)) as { targetId?: unknown; reason?: unknown } | null
      const { targetId, reason } = body ?? {}
      if (typeof targetId !== 'string' || typeof reason !== 'string' || !reason.trim() || reason.length > MAX_REASON) {
        return c.json<ApiError>({ error: `expected { targetId, reason: 1–${MAX_REASON} characters }` }, 400)
      }
      const live = isMadeId(targetId)
        ? (await db.$count(madePuzzle, and(eq(madePuzzle.id, targetId), isNull(madePuzzle.removedAt)))) +
          (await db.$count(madeCampaign, and(eq(madeCampaign.id, targetId), isNull(madeCampaign.removedAt))))
        : 0
      if (live === 0) return c.json<ApiError>({ error: `no player-made puzzle or campaign '${targetId}'` }, 404)
      await db.insert(report).values({
        targetId,
        reason: reason.trim(),
        reporterId: viewer?.id ?? null,
        reporterIp: viewer ? null : ip,
      })
      return c.body(null, 204)
    })
}

/** Every report, newest first, with what it points at; for `pnpm reports`. */
export async function listReports(db: Db) {
  return db
    .select({
      at: report.createdAt,
      target: report.targetId,
      kind: sql<string>`case when ${madePuzzle.id} is not null then 'puzzle' else 'campaign' end`,
      title: sql<string>`coalesce(${madePuzzle.title}, ${madeCampaign.title})`,
      author: user.handle,
      removed: sql<boolean>`coalesce(${madePuzzle.removedAt}, ${madeCampaign.removedAt}) is not null`,
      reason: report.reason,
      by: sql<string>`coalesce(${report.reporterId}, ${report.reporterIp}, '?')`,
    })
    .from(report)
    .leftJoin(madePuzzle, eq(madePuzzle.id, report.targetId))
    .leftJoin(madeCampaign, eq(madeCampaign.id, report.targetId))
    .leftJoin(user, sql`${user.id} = coalesce(${madePuzzle.authorId}, ${madeCampaign.authorId})`)
    .orderBy(desc(report.createdAt))
}
