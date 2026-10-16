/**
 * Player-made work: ids, draft validation, publish checks, and the lookups play, the Workshop and the takedown
 * script share. Rows live in `made_puzzle` / `made_campaign`; drafts in `draft_puzzle` / `draft_campaign`.
 */
import { randomInt } from 'node:crypto'
import { type Checks, MAX_SIZE, check, meetsRules, toSeed } from '@pixel-imperium/nonogram'
import type {
  CampaignPreview,
  CrestDraft,
  DraftCampaignDoc,
  DraftProvince,
  HexPaper,
  MadeContext,
  PreviewPuzzle,
  Tier,
} from '@pixel-imperium/protocol'
import { and, eq, inArray, isNull, ne, or } from 'drizzle-orm'
import { type Crest, buildCrest, crestFit, suggestTierCuts, tierAt } from './campaigns.ts'
import type { Db } from './db/index.ts'
import { draftPuzzle, madeCampaign, madePuzzle, progress, solve, user } from './db/schema.ts'
import { type Puzzle, parseSeedPuzzle } from './puzzles.ts'

export const DRAFT_PUZZLE_CAP = 200
export const DAILY_PUZZLE_PUBLISHES = 20
export const DAILY_CAMPAIGN_PUBLISHES = 3
export const MAX_PROVINCES = 6
export const MAX_PROVINCE_PUZZLES = 30

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'
const MADE_ID = /^(?=.*\d)[a-z0-9]{10}$/

/** 10 lowercase letters and digits, at least one a digit, so it never reads as an official word slug. */
export function randomMadeId(): string {
  for (;;) {
    const id = Array.from({ length: 10 }, () => ID_CHARS[randomInt(ID_CHARS.length)]).join('')
    if (MADE_ID.test(id)) return id
  }
}

export const isMadeId = (id: string) => MADE_ID.test(id)

/** A fresh id unused by any published puzzle or campaign, nor by `official`. */
export async function newMadeId(db: Pick<Db, 'select'>, official: (id: string) => boolean): Promise<string> {
  for (;;) {
    const id = randomMadeId()
    if (official(id)) continue
    const [p] = await db.select({ id: madePuzzle.id }).from(madePuzzle).where(eq(madePuzzle.id, id))
    const [c] = p ? [] : await db.select({ id: madeCampaign.id }).from(madeCampaign).where(eq(madeCampaign.id, id))
    if (!p && !c) return id
  }
}

export const DRAFT_ID = /^[A-Za-z0-9_-]{1,64}$/
const HEX = /^#[0-9a-f]{6}$/i
const MAX_TITLE = 80
const MAX_FLAVOUR = 200
const MAX_CREST_SIDE = 40
const MAX_CREST_COLORS = 16
const MAX_STRIP = 32

export const isHexPaper = (v: unknown): v is HexPaper => typeof v === 'string' && HEX.test(v)
const isPaperOrNull = (v: unknown): v is HexPaper | null => v === null || isHexPaper(v)
const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

export interface DraftPuzzleInput {
  title: string
  width: number
  height: number
  cells: (string | null)[]
  colors: string[]
  paper: HexPaper | null
  updatedAt: Date
}

export function parseDraftPuzzle(body: unknown): DraftPuzzleInput | null {
  if (!body || typeof body !== 'object') return null
  const { title, width, height, cells, colors, paper, updatedAt } = body as Record<string, unknown>
  const at = new Date(typeof updatedAt === 'string' ? updatedAt : NaN)
  const side = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= MAX_SIZE
  if (!isText(title, MAX_TITLE) || !side(width) || !side(height) || !isPaperOrNull(paper) || isNaN(at.getTime())) return null
  if (!Array.isArray(colors) || colors.length > MAX_STRIP || !colors.every(isHexPaper)) return null
  const strip = new Set<string>(colors)
  if (!Array.isArray(cells) || cells.length !== width * height) return null
  if (!cells.every(c => c === null || (typeof c === 'string' && strip.has(c)))) return null
  return { title, width, height, cells, colors, paper, updatedAt: at }
}

function parseCrest(value: unknown): CrestDraft | null | undefined {
  if (value === null) return null
  if (!value || typeof value !== 'object') return undefined
  const { palette, rows, regions } = value as Record<string, unknown>
  if (!palette || typeof palette !== 'object' || Array.isArray(palette)) return undefined
  const entries = Object.entries(palette)
  if (entries.length > MAX_CREST_COLORS || !entries.every(([k, v]) => k.length === 1 && k !== '.' && isHexPaper(v))) {
    return undefined
  }
  const layer = (v: unknown): v is string[] =>
    Array.isArray(v) && v.length <= MAX_CREST_SIDE && v.every(row => isText(row, MAX_CREST_SIDE))
  if (!layer(rows) || !layer(regions)) return undefined
  return { palette: palette as Record<string, string>, rows, regions }
}

function parseProvince(value: unknown): DraftProvince | null {
  if (!value || typeof value !== 'object') return null
  const { name, flavour, paper, puzzleIds } = value as Record<string, unknown>
  if (!isText(name, MAX_TITLE) || !isText(flavour, MAX_FLAVOUR) || !isPaperOrNull(paper)) return null
  if (!Array.isArray(puzzleIds) || puzzleIds.length > MAX_PROVINCE_PUZZLES) return null
  if (!puzzleIds.every(id => typeof id === 'string' && DRAFT_ID.test(id))) return null
  return { name, flavour, paper, puzzleIds }
}

export function parseCampaignDoc(value: unknown): DraftCampaignDoc | null {
  if (!value || typeof value !== 'object') return null
  const { title, paper, provinces, crest } = value as Record<string, unknown>
  if (!isText(title, MAX_TITLE) || !isPaperOrNull(paper)) return null
  if (!Array.isArray(provinces) || provinces.length > MAX_PROVINCES) return null
  const parsed = provinces.map(parseProvince)
  const crestDraft = parseCrest(crest ?? null)
  if (!parsed.every(p => p !== null) || crestDraft === undefined) return null
  return { title, paper, provinces: parsed, crest: crestDraft }
}

/** `check()` is the costly part of a campaign sync, and most drafts in it are unchanged between syncs. */
const checkCache = new Map<string, Checks>()

export function cachedCheck(width: number, height: number, filled: readonly boolean[]): Checks {
  const key = `${width}x${height}:${filled.map(f => (f ? 1 : 0)).join('')}`
  let checks = checkCache.get(key)
  if (!checks) {
    if (checkCache.size > 2_000) checkCache.clear()
    checks = check(width, height, filled)
    checkCache.set(key, checks)
  }
  return checks
}

type DraftRow = typeof draftPuzzle.$inferSelect
export type MadePuzzleRow = typeof madePuzzle.$inferSelect
export type MadeCampaignRow = typeof madeCampaign.$inferSelect

/** A draft's publish check: its checks, and whether it meets every rule. */
export function draftChecks(draft: Pick<DraftRow, 'width' | 'height' | 'cells'>): { checks: Checks; ok: boolean } {
  const checks = cachedCheck(draft.width, draft.height, draft.cells.map(c => c !== null))
  const colors = new Set(draft.cells.filter(c => c !== null)).size
  return { checks, ok: meetsRules(checks, colors) }
}

export function seedOf(draft: Pick<DraftRow, 'title' | 'width' | 'height' | 'cells' | 'colors'>, id: string) {
  return toSeed({ id, title: draft.title, width: draft.width, height: draft.height, cells: draft.cells, colors: draft.colors })
}

/** What a campaign doc's puzzle refs point at: the Author's draft, or their published puzzle (or the one a draft became). */
export type Resolved = { draft: DraftRow } | { made: MadePuzzleRow }

export async function resolveRefs(db: Pick<Db, 'select'>, userId: string, refs: readonly string[]) {
  const ids = [...new Set(refs)]
  if (ids.length === 0) return new Map<string, Resolved>()
  const [drafts, made] = await Promise.all([
    db
      .select()
      .from(draftPuzzle)
      .where(and(eq(draftPuzzle.userId, userId), inArray(draftPuzzle.id, ids))),
    db
      .select()
      .from(madePuzzle)
      .where(
        and(
          eq(madePuzzle.authorId, userId),
          isNull(madePuzzle.removedAt),
          isNull(madePuzzle.retiredAt),
          or(inArray(madePuzzle.id, ids), inArray(madePuzzle.draftId, ids)),
        ),
      ),
  ])
  const resolved = new Map<string, Resolved>()
  for (const m of made) {
    resolved.set(m.id, { made: m })
    if (m.draftId) resolved.set(m.draftId, { made: m })
  }
  for (const d of drafts) resolved.set(d.id, { draft: d })
  return resolved
}

/**
 * Tier cuts and the publish rules for a campaign doc, per province. A published puzzle already in a campaign other
 * than `campaignId` is taken, as is a puzzle's second appearance in the doc.
 */
export function previewOf(doc: DraftCampaignDoc, resolved: ReadonlyMap<string, Resolved>, campaignId?: string): CampaignPreview {
  const seen = new Set<string>()
  const provinces = doc.provinces.map(province => {
    const puzzles = province.puzzleIds.map((ref): PreviewPuzzle => {
      const r = resolved.get(ref)
      if (!r) return { id: ref, problem: 'missing', passes: null, width: 0, height: 0 }
      const key = 'draft' in r ? `draft:${r.draft.id}` : r.made.id
      const twice = seen.has(key)
      seen.add(key)
      if ('made' in r) {
        const { width, height } = parseSeedPuzzle(r.made.seed)
        const taken = twice || (r.made.campaignId !== null && r.made.campaignId !== campaignId)
        return { id: ref, ...(taken && { problem: 'taken' }), passes: r.made.passes, width, height }
      }
      const { checks, ok } = draftChecks(r.draft)
      const problem = twice ? 'taken' : ok ? undefined : 'fails'
      return { id: ref, ...(problem && { problem }), passes: checks.passes, width: r.draft.width, height: r.draft.height }
    })
    return { tiers: suggestTierCuts(puzzles), puzzles }
  })
  const total = provinces.reduce((n, p) => n + p.puzzles.length, 0)
  const counts = provinces.map(p => p.puzzles.length)
  return { provinces, crest: doc.crest ? { ...crestFit(doc.crest, counts), puzzles: total } : null }
}

/** The crest of a published campaign, its puzzles placed by province order. */
export function madeCrest(c: Pick<MadeCampaignRow, 'crest' | 'provinces'>): Crest | undefined {
  return c.crest ? buildCrest(c.crest, c.provinces.map(p => ({ puzzles: p.puzzleIds.map(id => ({ id })) }))) : undefined
}

/** A published puzzle as play sees it: the picture, its Author and place, its tier when its province has cuts. */
export interface MadePuzzle extends Puzzle {
  authorId: string
  made: MadeContext
  tier?: Tier
  /** Every puzzle id whose progress counts as having started it: its campaign's, or its own. */
  startedIds: string[]
  campaign: MadeCampaignRow | null
}

/** A published puzzle by id, `undefined` if there is none or it was taken down. */
export async function loadMadePuzzle(db: Pick<Db, 'select'>, id: string): Promise<MadePuzzle | undefined> {
  if (!isMadeId(id)) return undefined
  const [row] = await db
    .select({ puzzle: madePuzzle, author: user.handle, campaign: madeCampaign })
    .from(madePuzzle)
    .innerJoin(user, eq(user.id, madePuzzle.authorId))
    .leftJoin(madeCampaign, eq(madeCampaign.id, madePuzzle.campaignId))
    .where(eq(madePuzzle.id, id))
  if (!row || row.puzzle.removedAt || row.campaign?.removedAt) return undefined
  return madePuzzleFrom(row.puzzle, row.author, row.campaign)
}

export function madePuzzleFrom(p: MadePuzzleRow, author: string, campaign: MadeCampaignRow | null): MadePuzzle {
  const k = campaign ? campaign.provinces.findIndex(pr => pr.puzzleIds.includes(p.id)) : -1
  const province = campaign?.provinces[k]
  const slot = province ? province.puzzleIds.indexOf(p.id) + 1 : 0
  const retired = p.retiredAt ?? campaign?.retiredAt
  return {
    ...parseSeedPuzzle({ ...p.seed, id: p.id }),
    title: p.title,
    authorId: p.authorId,
    made: {
      author,
      ...(p.paper && { paper: p.paper as HexPaper }),
      ...(campaign && province && { campaign: { id: campaign.id, provinceId: String(k + 1) } }),
      ...(retired && { retired: true }),
    },
    ...(province?.tiers && { tier: tierAt(slot, province.tiers) }),
    startedIds: campaign ? campaign.provinces.flatMap(pr => pr.puzzleIds) : [p.id],
    campaign,
  }
}

/** Whether `userId` has a grid or a solve on any of `puzzleIds`. */
export async function hasStarted(db: Pick<Db, 'select'>, userId: string, puzzleIds: readonly string[]): Promise<boolean> {
  if (puzzleIds.length === 0) return false
  const ids = [...puzzleIds]
  const [grid] = await db
    .select({ id: progress.puzzleId })
    .from(progress)
    .where(and(eq(progress.userId, userId), inArray(progress.puzzleId, ids)))
    .limit(1)
  if (grid) return true
  const [solved] = await db
    .select({ id: solve.puzzleId })
    .from(solve)
    .where(and(eq(solve.userId, userId), inArray(solve.puzzleId, ids)))
    .limit(1)
  return !!solved
}

/** Whether any Account but the Author has a grid or a solve on any of `puzzleIds`, which rules out deleting it. */
export async function othersStarted(db: Pick<Db, 'select'>, authorId: string, puzzleIds: readonly string[]): Promise<boolean> {
  if (puzzleIds.length === 0) return false
  const ids = [...puzzleIds]
  const [grid] = await db
    .select({ id: progress.puzzleId })
    .from(progress)
    .where(and(ne(progress.userId, authorId), inArray(progress.puzzleId, ids)))
    .limit(1)
  if (grid) return true
  const [solved] = await db
    .select({ id: solve.puzzleId })
    .from(solve)
    .where(and(ne(solve.userId, authorId), inArray(solve.puzzleId, ids)))
    .limit(1)
  return !!solved
}

/**
 * Takes down a published puzzle or campaign (a campaign's puzzles with it), and with `ban` stops its Author
 * publishing. Returns what it took down, or `null` for an unknown id.
 */
export async function takedown(db: Db, id: string, ban: boolean): Promise<{ kind: 'puzzle' | 'campaign'; authorId: string } | null> {
  return db.transaction(async tx => {
    const removedAt = new Date()
    const [p] = await tx.update(madePuzzle).set({ removedAt }).where(eq(madePuzzle.id, id)).returning()
    const [c] = p ? [] : await tx.update(madeCampaign).set({ removedAt }).where(eq(madeCampaign.id, id)).returning()
    if (c) await tx.update(madePuzzle).set({ removedAt }).where(eq(madePuzzle.campaignId, id))
    const authorId = p?.authorId ?? c?.authorId
    if (!authorId) return null
    if (ban) await tx.update(user).set({ publishBannedAt: removedAt }).where(eq(user.id, authorId))
    return { kind: p ? 'puzzle' : 'campaign', authorId }
  })
}
