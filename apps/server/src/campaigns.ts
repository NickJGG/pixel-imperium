import { existsSync, readFileSync } from 'node:fs'
import { PAPER_NAMES, type PaperId, type Tier } from '@pixel-imperium/protocol'
import { isUnique, logicPassCount, rateDifficulty } from '@pixel-imperium/nonogram'
import { dateStart } from './dailies.ts'
import { type Puzzle, type SeedPuzzle, parseSeedPuzzle } from './puzzles.ts'

/**
 * Campaign data lives in `data/campaigns/`: `index.json` lists campaign ids (first = default), and each
 * `<id>/` holds `campaign.json` (`CampaignDef`), one `<provinceId>.json` (`SeedPuzzle[]`, easiest
 * first) per province, and `crest.json` (`CrestDef`, optional for drafts).
 */
export const CAMPAIGNS_DIR = new URL('../data/campaigns/', import.meta.url)

export interface ProvinceDef {
  id: string
  name: string
  theme: string
  flavour: string
  paper: PaperId
  /** Inclusive bounds on both dimensions. */
  minSize: number
  maxSize: number
  /** 1-based slots where Medium and Hard start; required outside drafts. */
  tiers?: [number, number]
  /** Offer the Techniques when this province starts; at most one per campaign. */
  techniques?: true
}

export interface CampaignDef {
  id: string
  name: string
  /** Served outside production only; its puzzle counts and crest regions need only stay within bounds. */
  draft: boolean
  /** `YYYY-MM-DD`; required outside drafts. Production serves the campaign from this date. */
  released?: string
  /** Its spine and column on Home and the Campaigns row. */
  paper: PaperId
  closingLine: string
  puzzlesPerProvince: number
  provinces: ProvinceDef[]
}

const HOLE = '.'

/**
 * The Crest: one pixel per puzzle. `regions` gives each pixel's province as its 1-based index; puzzle #k of
 * a province owns the k-th pixel of its region in reading order. `.` in both layers is a hole, no pixel at all.
 */
export interface CrestDef {
  palette: Record<string, string>
  rows: string[]
  regions: string[]
}

export interface Crest extends CrestDef {
  width: number
  height: number
  /** Puzzle id → its row-major pixel index. */
  at: Map<string, number>
  /** Puzzle id → its pixel's hex color; secret until the puzzle is solved. */
  color: Map<string, string>
  /** Row-major indices of its holes. */
  holes: number[]
}

export interface CampaignSource {
  campaign: CampaignDef
  provinces: Record<string, SeedPuzzle[]>
  crest?: CrestDef
}

export interface CampaignPuzzle extends Puzzle {
  campaignId: string
  provinceId: string
  tier?: Tier
}

export interface Campaign extends Omit<CampaignDef, 'provinces'> {
  provinces: (ProvinceDef & { puzzles: CampaignPuzzle[] })[]
  crest?: Crest
}

const readJson = <T>(url: URL) => JSON.parse(readFileSync(url, 'utf8')) as T

export function readCampaignSources(dir: URL = CAMPAIGNS_DIR): CampaignSource[] {
  return readJson<string[]>(new URL('index.json', dir)).map(id => {
    const base = new URL(`${id}/`, dir)
    const campaign = readJson<CampaignDef>(new URL('campaign.json', base))
    if (campaign.id !== id) throw new Error(`${id}/campaign.json has id '${campaign.id}'`)
    const provinces = Object.fromEntries(
      campaign.provinces.map(p => [p.id, readJson<SeedPuzzle[]>(new URL(`${p.id}.json`, base))]),
    )
    const crestUrl = new URL('crest.json', base)
    return { campaign, provinces, ...(existsSync(crestUrl) && { crest: readJson<CrestDef>(crestUrl) }) }
  })
}

/** Assembles a campaign, throwing on malformed data; the campaign rules are `campaignProblems`'s job. */
export function buildCampaign({ campaign, provinces, crest }: CampaignSource): Campaign {
  const built = {
    ...campaign,
    provinces: campaign.provinces.map(p => ({
      ...p,
      puzzles: (provinces[p.id] ?? []).map((seed, i) => ({
        ...parseSeedPuzzle(seed),
        campaignId: campaign.id,
        provinceId: p.id,
        ...(p.tiers && { tier: tierAt(i + 1, p.tiers) }),
      })),
    })),
  }
  return crest ? { ...built, crest: buildCrest(crest, built.provinces) } : built
}

export function buildCrest(def: CrestDef, provinces: readonly { puzzles: readonly { id: string }[] }[]): Crest {
  const width = def.rows[0]?.length ?? 0
  const regions = new Map<string, number[]>()
  const holes: number[] = []
  def.regions.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (def.rows[y]?.[x] === HOLE || row[x] === HOLE) {
        holes.push(y * width + x)
        continue
      }
      const pixels = regions.get(row[x]!) ?? []
      pixels.push(y * width + x)
      regions.set(row[x]!, pixels)
    }
  })
  const at = new Map<string, number>()
  const color = new Map<string, string>()
  provinces.forEach((p, k) => {
    const pixels = regions.get(String(k + 1)) ?? []
    p.puzzles.forEach((puzzle, i) => {
      const index = pixels[i]
      if (index === undefined) return
      at.set(puzzle.id, index)
      const hex = def.palette[def.rows[Math.floor(index / width)]?.[index % width] ?? '']
      if (hex) color.set(puzzle.id, hex)
    })
  })
  return { ...def, width, height: def.rows.length, at, color, holes }
}

function crestProblems(c: Campaign, crest: Crest): string[] {
  const problems: string[] = []
  const where = `${c.id}/crest`
  const { width, height } = crest
  for (const [name, rows] of [['rows', crest.rows], ['regions', crest.regions]] as const) {
    if (rows.length !== height) problems.push(`${where}: has ${rows.length} ${name}, expected ${height}`)
    rows.forEach((row, y) => {
      if (row.length !== width) problems.push(`${where}: ${name} row ${y + 1} is ${row.length} wide, expected ${width}`)
    })
  }
  const total = c.provinces.reduce((n, p) => n + p.puzzles.length, 0)
  const pixels = width * height - crest.holes.length
  if (!c.draft && pixels !== total) problems.push(`${where}: has ${pixels} pixels, expected ${total}`)

  const [rows, regions] = [crest.rows.join(''), crest.regions.join('')]
  const halfHoles = [...rows].filter((ch, i) => (ch === HOLE) !== (regions[i] === HOLE)).length
  if (halfHoles > 0) problems.push(`${where}: ${halfHoles} pixels are '${HOLE}' in only one of rows and regions`)
  const unknown = [...new Set(rows)].filter(ch => ch !== HOLE && !(ch in crest.palette))
  if (unknown.length > 0) problems.push(`${where}: '${unknown.join('')}' not in its palette`)
  const provinceKeys = new Set(c.provinces.map((_, k) => String(k + 1)))
  const strays = [...new Set(regions)].filter(ch => ch !== HOLE && !provinceKeys.has(ch))
  if (strays.length > 0) problems.push(`${where}: regions '${strays.join('')}' name no province`)

  const sizes = new Map<string, number>()
  for (const ch of regions) sizes.set(ch, (sizes.get(ch) ?? 0) + 1)
  c.provinces.forEach((p, k) => {
    const size = sizes.get(String(k + 1)) ?? 0
    if (c.draft ? size < p.puzzles.length : size !== p.puzzles.length) {
      const expected = c.draft ? `at least ${p.puzzles.length}` : p.puzzles.length
      problems.push(`${where}: ${p.id}'s region has ${size} pixels, expected ${expected}`)
    }
  })
  return problems
}

/**
 * Whether a player-made crest fits provinces of `counts` puzzles: every rule an official crest meets. `pixels` is its
 * filled pixels, for the builder's "n / m".
 */
export function crestFit(def: CrestDef, counts: readonly number[]): { pixels: number; fits: boolean } {
  const provinces = counts.map((n, k) => ({ id: String(k + 1), puzzles: Array.from({ length: n }, (_, i) => ({ id: `${k}:${i}` })) }))
  const crest = buildCrest(def, provinces)
  const pixels = crest.width * crest.height - crest.holes.length
  const campaign = { id: 'crest', draft: false, provinces } as unknown as Campaign
  const malformed = Object.values(def.palette).some(hex => typeof hex !== 'string' || !HEX.test(hex))
  return { pixels, fits: crest.width > 0 && !malformed && crestProblems(campaign, crest).length === 0 }
}

const HEX = /^#[0-9a-f]{6}$/i

export const tierAt = (slot: number, [medium, hard]: [number, number]): Tier =>
  slot >= hard ? 'hard' : slot >= medium ? 'medium' : 'easy'

const isPaper = (name: string) => (PAPER_NAMES as readonly string[]).includes(name)

const isStep = (n: number) => Number.isInteger(n) && n > 0 && n % 5 === 0

/** Structural rule violations across all campaigns; cheap enough to run at startup. */
export function campaignProblems(campaigns: readonly Campaign[]): string[] {
  const problems: string[] = []
  const seen = new Map<string, string>()
  const claim = (kind: string, id: string, where: string) => {
    const key = `${kind}:${id}`
    const prior = seen.get(key)
    if (prior) problems.push(`${where}: ${kind} id '${id}' is already used by ${prior}`)
    else seen.set(key, where)
  }

  for (const c of campaigns) {
    claim('campaign', c.id, c.id)
    if (c.provinces.length === 0) problems.push(`${c.id}: has no provinces`)
    if (!Number.isInteger(c.puzzlesPerProvince) || c.puzzlesPerProvince < 1) {
      problems.push(`${c.id}: puzzlesPerProvince must be a positive integer`)
    }

    if (c.released === undefined) {
      if (!c.draft) problems.push(`${c.id}: needs a released date`)
    } else if (dateStart(c.released) === null) problems.push(`${c.id}: released '${c.released}' is not a YYYY-MM-DD date`)
    if (!isPaper(c.paper)) problems.push(`${c.id}: paper '${c.paper}' is not in the pool`)

    if (c.crest) problems.push(...crestProblems(c, c.crest))
    else if (!c.draft) problems.push(`${c.id}: needs a crest`)

    if (c.provinces.filter(p => p.techniques).length > 1) problems.push(`${c.id}: more than one province offers techniques`)
    const provinceIds = new Set<string>()
    for (const p of c.provinces) {
      const where = `${c.id}/${p.id}`
      if (provinceIds.has(p.id)) problems.push(`${where}: province id is used twice`)
      provinceIds.add(p.id)
      if (!isPaper(p.paper)) problems.push(`${where}: paper '${p.paper}' is not in the pool`)
      if (!isStep(p.minSize) || !isStep(p.maxSize) || p.minSize > p.maxSize) {
        problems.push(`${where}: size band ${p.minSize}–${p.maxSize} must be multiples of 5, low to high`)
      }

      const count = p.puzzles.length
      if (p.tiers === undefined) {
        if (!c.draft) problems.push(`${where}: needs tiers`)
      } else {
        const [medium, hard] = p.tiers
        if (
          p.tiers.length !== 2 ||
          !Number.isInteger(medium) ||
          !Number.isInteger(hard) ||
          !(medium >= 2 && medium < hard && hard <= count)
        ) {
          problems.push(`${where}: tiers [m, h] must be slots with 2 ≤ medium < hard ≤ ${count}`)
        }
      }
      if (c.draft ? count > c.puzzlesPerProvince : count !== c.puzzlesPerProvince) {
        problems.push(`${where}: has ${count} puzzles, expected ${c.puzzlesPerProvince}`)
      }
      for (const puzzle of p.puzzles) {
        claim('puzzle', puzzle.id, where)
        for (const [dim, n] of [['width', puzzle.width], ['height', puzzle.height]] as const) {
          if (!isStep(n) || n < p.minSize || n > p.maxSize) {
            problems.push(`${where}/${puzzle.id}: ${dim} ${n} must be a multiple of 5 within ${p.minSize}–${p.maxSize}`)
          }
        }
      }
    }
  }
  return problems
}

const MIN_BAND = 3

/**
 * Suggested `tiers` for a province, for the author to compare against the frozen cuts. Scores each puzzle
 * by `passes × max(width, height) / 5` (a stand-in for real difficulty), takes the running max so tiers
 * never drop, then finds the contiguous three-way split with the least within-band squared error, each
 * band at least 3 slots. `null` if there are fewer than 9 puzzles or any is not line-solvable.
 */
export function suggestTierCuts(
  puzzles: readonly { width: number; height: number; passes: number | null }[],
): [number, number] | null {
  if (puzzles.length < 3 * MIN_BAND) return null
  const scores: number[] = []
  for (const p of puzzles) {
    if (p.passes === null) return null
    scores.push(Math.max(scores.at(-1) ?? 0, (p.passes * Math.max(p.width, p.height)) / 5))
  }

  const sum = [0]
  const sumSq = [0]
  for (const x of scores) {
    sum.push(sum.at(-1)! + x)
    sumSq.push(sumSq.at(-1)! + x * x)
  }
  /** Squared error of `scores[from..to)` about its mean. */
  const cost = (from: number, to: number) => {
    const s = sum[to]! - sum[from]!
    return sumSq[to]! - sumSq[from]! - (s * s) / (to - from)
  }

  const n = scores.length
  let best: [number, number] | null = null
  let bestCost = Infinity
  for (let m = MIN_BAND; m <= n - 2 * MIN_BAND; m++) {
    for (let h = m + MIN_BAND; h <= n - MIN_BAND; h++) {
      const total = cost(0, m) + cost(m, h) + cost(h, n)
      if (total < bestCost - 1e-9) {
        bestCost = total
        best = [m + 1, h + 1]
      }
    }
  }
  return best
}

export interface PuzzleReport {
  id: string
  provinceId: string
  width: number
  height: number
  unique: boolean
  logicSolvable: boolean
  rating: number
  /** Line-logic sweeps to solve, `null` if line logic stalls. */
  passes: number | null
}

/** Runs the solver over a campaign in play order: every puzzle unique and line-solvable, difficulty never decreasing. */
export function solverReport(campaign: Campaign): { puzzles: PuzzleReport[]; problems: string[] } {
  const puzzles: PuzzleReport[] = []
  const problems: string[] = []
  for (const province of campaign.provinces) {
    for (const p of province.puzzles) {
      const where = `${campaign.id}/${province.id}/${p.id}`
      const passes = logicPassCount(p.clues)
      const report: PuzzleReport = {
        id: p.id,
        provinceId: province.id,
        width: p.width,
        height: p.height,
        unique: isUnique(p.clues),
        logicSolvable: passes !== null,
        rating: rateDifficulty(p.clues),
        passes,
      }
      if (!report.unique) problems.push(`${where}: has more than one solution`)
      if (!report.logicSolvable) problems.push(`${where}: is not solvable by line logic alone`)
      const prev = puzzles.at(-1)
      if (prev && report.rating < prev.rating) {
        problems.push(`${where}: rated ${report.rating}, easier than ${prev.id} before it (${prev.rating})`)
      }
      puzzles.push(report)
    }
  }
  return { puzzles, problems }
}

/**
 * Reads, builds and structurally checks every campaign, throwing on any problem. Without `includeDrafts`, drafts
 * and campaigns released after `now`'s UTC date are left out; the server reads them once, at startup.
 */
export function loadCampaigns(
  { includeDrafts, now = Date.now() }: { includeDrafts: boolean; now?: number },
  dir: URL = CAMPAIGNS_DIR,
): Campaign[] {
  const campaigns = readCampaignSources(dir).map(buildCampaign)
  const problems = campaignProblems(campaigns)
  if (problems.length > 0) throw new Error(`invalid campaign data:\n${problems.join('\n')}`)
  return campaigns.filter(c => includeDrafts || (!c.draft && dateStart(c.released!)! <= now))
}
