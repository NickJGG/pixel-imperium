/**
 * A draft campaign's edits, its crest's, and the draft as the album sees it: a `Campaign` whose puzzle ids are the
 * doc's refs (the Author's draft or published puzzle ids) and whose provinces are numbered `"1"`–`"6"`, tiered by the
 * server's last preview. Every edit is pure and returns a new doc.
 */
import type {
  Campaign,
  CampaignPreview,
  CrestDraft,
  DraftCampaignDoc,
  DraftProvince,
  Province,
  PuzzleSummary,
  Tier,
} from '@pixel-imperium/protocol'
import type { StoredDraft } from '../make/draft-store.ts'
import { type PuzzleEntry, titleOf } from './workshop.ts'

export const MAX_PROVINCES = 6
export const MAX_PROVINCE_PUZZLES = 30
/** Under this many puzzles a province has no Tiers. */
export const TIERED_FROM = 9
export const MAX_CREST_SIDE = 40
export const MAX_CREST_COLORS = 16

const HOLE = '.'

export interface Slot {
  /** Province index. */
  k: number
  /** Puzzle index within it. */
  i: number
}

const withProvince = (doc: DraftCampaignDoc, k: number, change: (p: DraftProvince) => DraftProvince): DraftCampaignDoc => ({
  ...doc,
  provinces: doc.provinces.map((p, j) => (j === k ? change(p) : p)),
})

export const provinceName = (doc: DraftCampaignDoc, k: number) => doc.provinces[k]?.name.trim() || `Province ${k + 1}`

/** The draft campaign and 1-based province a puzzle was opened from, the editor's `?in=<id>.<n>`. */
export interface InProvince {
  id: string
  n: number
}

export const formatIn = ({ id, n }: InProvince) => `${id}.${n}`

export function parseIn(value: unknown): InProvince | null {
  const m = typeof value === 'string' ? /^([^.]+)\.([1-9]\d*)$/.exec(value) : null
  return m ? { id: m[1]!, n: Number(m[2]) } : null
}

export function addProvince(doc: DraftCampaignDoc): DraftCampaignDoc {
  if (doc.provinces.length >= MAX_PROVINCES) return doc
  return { ...doc, provinces: [...doc.provinces, { name: '', flavour: '', paper: null, puzzleIds: [] }] }
}

/** Drops province `k`; its crest region goes to the province before it, or the first. */
export function removeProvince(doc: DraftCampaignDoc, k: number): DraftCampaignDoc {
  const provinces = doc.provinces.filter((_, j) => j !== k)
  const crest = doc.crest && {
    ...doc.crest,
    regions: doc.crest.regions.map(row =>
      [...row]
        .map(ch => {
          if (ch === HOLE) return ch
          const n = Number(ch)
          if (n === k + 1) return provinces.length === 0 ? HOLE : String(Math.max(1, k))
          return n > k + 1 ? String(n - 1) : ch
        })
        .join(''),
    ),
  }
  return { ...doc, provinces, crest: crest && provinces.length === 0 ? null : crest }
}

export const setProvince = (doc: DraftCampaignDoc, k: number, patch: Partial<Omit<DraftProvince, 'puzzleIds'>>) =>
  withProvince(doc, k, p => ({ ...p, ...patch }))

/** Puts `refs` at the end of province `k`, as many as fit, leaving out any already in the campaign. */
export function appendPuzzles(doc: DraftCampaignDoc, k: number, refs: readonly string[]): DraftCampaignDoc {
  const used = new Set(doc.provinces.flatMap(p => p.puzzleIds))
  return withProvince(doc, k, p => ({
    ...p,
    puzzleIds: [...p.puzzleIds, ...refs.filter(r => !used.has(r))].slice(0, MAX_PROVINCE_PUZZLES),
  }))
}

export const removePuzzle = (doc: DraftCampaignDoc, { k, i }: Slot) =>
  withProvince(doc, k, p => ({ ...p, puzzleIds: p.puzzleIds.filter((_, j) => j !== i) }))

/**
 * Moves the puzzle at `from` so it lands at `to`, `to.i` counted once it has left; another province takes it at
 * its end when it has room.
 */
export function movePuzzle(doc: DraftCampaignDoc, from: Slot, to: Slot): DraftCampaignDoc {
  const ref = doc.provinces[from.k]?.puzzleIds[from.i]
  const target = doc.provinces[to.k]
  if (ref === undefined || !target) return doc
  if (from.k !== to.k && target.puzzleIds.length >= MAX_PROVINCE_PUZZLES) return doc
  if (from.k === to.k && from.i === to.i) return doc
  const removed = removePuzzle(doc, from)
  return withProvince(removed, to.k, p => {
    const puzzleIds = [...p.puzzleIds]
    puzzleIds.splice(Math.min(to.i, puzzleIds.length), 0, ref)
    return { ...p, puzzleIds }
  })
}

export const puzzleTotal = (doc: DraftCampaignDoc) => doc.provinces.reduce((n, p) => n + p.puzzleIds.length, 0)

/** Whether the preview was made of this doc's puzzles, in this order. */
export const previewMatches = (doc: DraftCampaignDoc, preview: CampaignPreview | null): preview is CampaignPreview =>
  preview !== null &&
  preview.provinces.length === doc.provinces.length &&
  doc.provinces.every((p, k) => {
    const seen = preview.provinces[k]!.puzzles
    return seen.length === p.puzzleIds.length && seen.every((q, i) => q.id === p.puzzleIds[i])
  })

export interface CampaignChecks {
  titled: boolean
  paper: boolean
  /** At least one province, and none empty. */
  filled: boolean
  /** Every puzzle meets the publish rules; `null` until the server has checked these puzzles. */
  pass: boolean | null
  crest: { pixels: number; puzzles: number; fits: boolean } | null
}

export function campaignChecks(doc: DraftCampaignDoc, preview: CampaignPreview | null): CampaignChecks {
  const counts = doc.provinces.map(p => p.puzzleIds.length)
  return {
    titled: doc.title.trim() !== '',
    paper: doc.paper !== null,
    filled: counts.length > 0 && counts.every(n => n > 0),
    pass: previewMatches(doc, preview) ? preview.provinces.every(p => p.puzzles.every(q => !q.problem)) : null,
    crest: doc.crest && { ...crestFit(doc.crest, counts), puzzles: puzzleTotal(doc) },
  }
}

/** Whether it can go to the server; a pass still being checked is left to it. */
export const ready = (c: CampaignChecks) => c.titled && c.paper && c.filled && c.pass !== false

/* The crest. Rows hold palette keys, regions 1-based province numbers; a hole is `.` in both. */

export const crestWidth = (crest: CrestDraft) => crest.rows[0]?.length ?? 0

const flat = (rows: readonly string[]) => rows.join('')

export const crestPixels = (crest: CrestDraft) => [...flat(crest.rows)].filter(ch => ch !== HOLE).length

/** Each province's filled pixels, by index. */
export function regionCounts(crest: CrestDraft, provinces: number): number[] {
  const counts = Array<number>(provinces).fill(0)
  for (const ch of flat(crest.regions)) {
    const k = Number(ch) - 1
    if (ch !== HOLE && k >= 0 && k < provinces) counts[k]!++
  }
  return counts
}

/** As the server's check: one pixel per puzzle, each province's region its own number of pixels. */
export function crestFit(crest: CrestDraft, counts: readonly number[]): { pixels: number; fits: boolean } {
  const pixels = crestPixels(crest)
  const regions = regionCounts(crest, counts.length)
  const total = counts.reduce((a, b) => a + b, 0)
  const strays = [...flat(crest.regions)].some(ch => ch !== HOLE && !(Number(ch) >= 1 && Number(ch) <= counts.length))
  return { pixels, fits: crestWidth(crest) > 0 && pixels === total && !strays && regions.every((n, k) => n === counts[k]) }
}

/** Gives the filled pixels to provinces in reading order, province 1 first; any past the last puzzle go to the last. */
export function autoRegions(crest: CrestDraft, counts: readonly number[]): CrestDraft {
  let k = 0
  let taken = 0
  const regions = crest.rows.map(row =>
    [...row]
      .map(ch => {
        if (ch === HOLE || counts.length === 0) return HOLE
        while (k < counts.length - 1 && taken >= counts[k]!) {
          k++
          taken = 0
        }
        taken++
        return String(k + 1)
      })
      .join(''),
  )
  return { ...crest, regions }
}

const KEYS = 'abcdefghijklmnopqrstuvwxyz'

/** The key for `hex`, adding it to the palette if there's room; `null` when it's full. */
export function keyFor(crest: CrestDraft, hex: string): { crest: CrestDraft; key: string } | null {
  const found = Object.entries(crest.palette).find(([, v]) => v.toLowerCase() === hex.toLowerCase())
  if (found) return { crest, key: found[0] }
  if (Object.keys(crest.palette).length >= MAX_CREST_COLORS) return null
  const key = [...KEYS].find(ch => !(ch in crest.palette))!
  return { crest: { ...crest, palette: { ...crest.palette, [key]: hex } }, key }
}

const setAt = (rows: readonly string[], index: number, width: number, ch: string) =>
  rows.map((row, y) => (y === Math.floor(index / width) ? row.slice(0, index % width) + ch + row.slice((index % width) + 1) : row))

/**
 * Paints pixel `index` with palette `key`, or a hole for `null`. A pixel newly filled joins the first province still
 * short of pixels, or the last.
 */
export function paintCrest(crest: CrestDraft, index: number, key: string | null, counts: readonly number[]): CrestDraft {
  const width = crestWidth(crest)
  const was = flat(crest.rows)[index]
  const ch = key ?? HOLE
  if (was === undefined || was === ch) return crest
  const rows = setAt(crest.rows, index, width, ch)
  let region = flat(crest.regions)[index]!
  if (key === null) region = HOLE
  else if (region === HOLE) {
    const have = regionCounts(crest, counts.length)
    const short = counts.findIndex((n, k) => have[k]! < n)
    region = counts.length === 0 ? '1' : String((short === -1 ? counts.length - 1 : short) + 1)
  }
  return { ...crest, rows, regions: setAt(crest.regions, index, width, region) }
}

/** Gives a filled pixel to province `k`; holes have no region. */
export function paintRegion(crest: CrestDraft, index: number, k: number): CrestDraft {
  if (flat(crest.rows)[index] === HOLE) return crest
  return { ...crest, regions: setAt(crest.regions, index, crestWidth(crest), String(k + 1)) }
}

/** Grows or crops from the bottom right; new pixels are holes. */
export function resizeCrest(crest: CrestDraft, width: number, height: number): CrestDraft {
  const fit = (rows: readonly string[]) =>
    Array.from({ length: height }, (_, y) => (rows[y] ?? '').slice(0, width).padEnd(width, HOLE))
  return { ...crest, rows: fit(crest.rows), regions: fit(crest.regions) }
}

/** A first crest: one pixel per puzzle in the paper's color, as square as it gets, regions given in reading order. */
export function blankCrest(counts: readonly number[], hex: string): CrestDraft {
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0))
  const width = Math.min(MAX_CREST_SIDE, Math.ceil(Math.sqrt(total)))
  const height = Math.min(MAX_CREST_SIDE, Math.ceil(total / width))
  const rows = Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => (y * width + x < total ? 'a' : HOLE)).join(''),
  )
  return autoRegions({ palette: { a: hex }, rows, regions: rows }, counts)
}

/** The crest's colors in reading order, `undefined` for a hole. */
export const crestColors = (crest: CrestDraft): (string | undefined)[] =>
  [...flat(crest.rows)].map(ch => (ch === HOLE ? undefined : crest.palette[ch]))

/* The draft as the album sees it. */

/** What the builder knows of one of the Author's puzzles. */
export interface PuzzleInfo {
  title: string
  width: number
  height: number
  kind: 'draft' | 'published'
  /** A published puzzle's picture, which its Author always has; a draft's when this device keeps it. */
  picture: (string | null)[] | null
}

/** Every puzzle of Yours by id, a draft's picture from this device's copy when it has one. */
export function puzzleInfos(entries: readonly PuzzleEntry[], local: ReadonlyMap<string, StoredDraft>): Map<string, PuzzleInfo> {
  return new Map(
    entries.map((e): [string, PuzzleInfo] =>
      e.kind === 'draft'
        ? [
            e.id,
            {
              title: e.title,
              width: e.width,
              height: e.height,
              kind: 'draft',
              picture: local.get(e.id)?.draft.cells ?? null,
            },
          ]
        : [
            e.puzzle.id,
            { title: e.puzzle.title, width: e.puzzle.width, height: e.puzzle.height, kind: 'published', picture: e.puzzle.palette },
          ],
    ),
  )
}

const tierAt = (slot: number, [medium, hard]: [number, number]): Tier =>
  slot >= hard ? 'hard' : slot >= medium ? 'medium' : 'easy'

/**
 * The preview's tier cuts for province `k`, while they still fit its puzzles: a stale preview keeps its cuts until the
 * next send rather than flattening the shelves meanwhile.
 */
export function tiersOf(doc: DraftCampaignDoc, preview: CampaignPreview | null, k: number): [number, number] | null {
  const tiers = preview?.provinces[k]?.tiers ?? null
  const count = doc.provinces[k]?.puzzleIds.length ?? 0
  return tiers && count >= TIERED_FROM && tiers[1] <= count ? tiers : null
}

/** The draft as a `Campaign`, its puzzles' ids its refs; a ref neither here nor checked yet stands as a 15×15 draft. */
export function draftAsCampaign(
  id: string,
  doc: DraftCampaignDoc,
  preview: CampaignPreview | null,
  infos: ReadonlyMap<string, PuzzleInfo>,
): Campaign {
  const provinces = doc.provinces.map((p, k): Province => {
    const tiers = tiersOf(doc, preview, k)
    const checked = preview?.provinces[k]?.puzzles
    const puzzles = p.puzzleIds.map((ref, i): PuzzleSummary => {
      const info = infos.get(ref)
      const seen = checked?.find(q => q.id === ref && q.width > 0)
      const width = info?.width ?? seen?.width ?? 15
      const height = info?.height ?? seen?.height ?? 15
      return {
        id: ref,
        title: titleOf(info?.title ?? ''),
        width,
        height,
        filledCount: info?.picture?.filter(c => c !== null).length ?? 0,
        ...(tiers && { tier: tierAt(i + 1, tiers) }),
      }
    })
    return {
      id: String(k + 1),
      name: provinceName(doc, k),
      theme: '',
      flavour: p.flavour,
      paper: p.paper ?? doc.paper ?? 'workshop',
      maxSize: Math.max(0, ...puzzles.map(q => Math.max(q.width, q.height))),
      puzzles,
    }
  })
  return { id, name: titleOf(doc.title), paper: doc.paper ?? 'workshop', closingLine: '', provinces }
}

/** A puzzle's problem in the preview, while the preview is of this doc. */
export function problemOf(doc: DraftCampaignDoc, preview: CampaignPreview | null, { k, i }: Slot) {
  return previewMatches(doc, preview) ? preview.provinces[k]!.puzzles[i]!.problem : undefined
}
