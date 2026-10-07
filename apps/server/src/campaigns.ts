import { readFileSync } from 'node:fs'
import { isUnique, logicPassCount, rateDifficulty } from '@pixel-imperium/nonogram'
import type { CampaignJourney } from '@pixel-imperium/protocol'
import { type Puzzle, type SeedPuzzle, parseSeedPuzzle } from './puzzles.ts'

/**
 * Campaign data lives in `data/campaigns/`: `index.json` lists campaign ids (first = default), and each
 * `<id>/` holds `campaign.json` (`CampaignDef`), `map.json` (`JourneyDef`) and one `<provinceId>.json`
 * (`SeedPuzzle[]`, easiest first) per province.
 */
export const CAMPAIGNS_DIR = new URL('../data/campaigns/', import.meta.url)

export interface ProvinceDef {
  id: string
  name: string
  theme: string
  flavour: string
  /** Inclusive bounds on both dimensions. */
  minSize: number
  maxSize: number
}

export interface CampaignDef {
  id: string
  name: string
  /** Served outside production only, and exempt from the puzzle count. */
  draft: boolean
  closingLine: string
  puzzlesPerProvince: number
  provinces: ProvinceDef[]
}

/**
 * One `width` × `height` Map per province, keyed by province id, its rows in palette keys (`.` = transparent)
 * and its Landmark map-local. Map i's top is at journey row i × `step`; `road` is in journey coordinates.
 */
export interface JourneyDef {
  palette: Record<string, string>
  width: number
  height: number
  step: number
  maps: Record<string, { rows: string[]; landmark: [number, number] }>
  road: [number, number][]
}

export interface CampaignSource {
  campaign: CampaignDef
  journey: JourneyDef
  provinces: Record<string, SeedPuzzle[]>
}

export interface CampaignPuzzle extends Puzzle {
  campaignId: string
  provinceId: string
}

export interface Campaign extends Omit<CampaignDef, 'provinces'> {
  journey: CampaignJourney
  provinces: (ProvinceDef & { puzzles: CampaignPuzzle[] })[]
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
    return { campaign, journey: readJson<JourneyDef>(new URL('map.json', base)), provinces }
  })
}

function parseGrid<T>(rows: string[], what: string, cell: (ch: string, r: number) => T): { width: number; cells: T[] } {
  const width = rows[0]?.length ?? 0
  if (width === 0) throw new Error(`${what} is empty`)
  const cells: T[] = []
  for (const [r, row] of rows.entries()) {
    if (row.length !== width) throw new Error(`${what} row ${r} is ${row.length} wide, expected ${width}`)
    for (const ch of row) cells.push(cell(ch, r))
  }
  return { width, cells }
}

/** Throws on malformed data; the Road's shape is left to `journeyProblems`. */
export function parseJourney(id: string, def: JourneyDef, provinceIds: string[]): CampaignJourney {
  const { palette, width, height, step } = def
  if (!Number.isInteger(step) || step < 1 || step > height) throw new Error(`${id} journey step ${step} must be 1–${height}`)
  for (const mapId of Object.keys(def.maps)) {
    if (!provinceIds.includes(mapId)) throw new Error(`${id} journey has a map for unknown province '${mapId}'`)
  }
  const maps = provinceIds.map(provinceId => {
    const map = def.maps[provinceId]
    if (!map) throw new Error(`${id}/${provinceId} has no map`)
    const what = `${id}/${provinceId} map`
    const art = parseGrid(map.rows, what, (ch, r) => {
      if (ch === '.') return null
      const color = palette[ch]
      if (!color) throw new Error(`${what} row ${r} uses '${ch}', which is not in the palette`)
      return color
    })
    if (art.width !== width || map.rows.length !== height) {
      throw new Error(`${what} is ${art.width}×${map.rows.length}, expected ${width}×${height}`)
    }
    const [x, y] = map.landmark
    return { colors: art.cells, landmark: { x, y } }
  })
  const road = def.road.map(([x, y]) => ({ x, y }))
  let from = 0
  const roadStops = maps.map(({ landmark }, i) => {
    const at = road.findIndex((p, k) => k >= from && p.x === landmark.x && p.y === i * step + landmark.y)
    if (at !== -1) from = at
    return at
  })
  return { width, height, step, maps, road, roadStops }
}

/** Assembles a campaign, throwing on malformed data; the campaign rules are `campaignProblems`'s job. */
export function buildCampaign({ campaign, journey, provinces }: CampaignSource): Campaign {
  const provinceIds = campaign.provinces.map(p => p.id)
  return {
    ...campaign,
    journey: parseJourney(campaign.id, journey, provinceIds),
    provinces: campaign.provinces.map(p => ({
      ...p,
      puzzles: (provinces[p.id] ?? []).map(seed => ({
        ...parseSeedPuzzle(seed),
        campaignId: campaign.id,
        provinceId: p.id,
      })),
    })),
  }
}

/**
 * The Journey's layout rules, each problem prefixed with `where`. Landmarks and the Road stay in the
 * middle two-thirds, the columns a phone shows.
 */
export function journeyProblems({ width, height, step, maps, road, roadStops }: CampaignJourney, provinceIds: string[], where: string): string[] {
  const problems: string[] = []
  const inMiddle = (x: number) => x >= width / 6 && x < (5 * width) / 6
  if (maps.length !== provinceIds.length) problems.push(`${where}: has ${maps.length} maps for ${provinceIds.length} provinces`)
  for (const [i, { landmark }] of maps.entries()) {
    const { x, y } = landmark
    if (!inMiddle(x) || y < 0 || y >= height) problems.push(`${where}/${provinceIds[i]}: landmark (${x}, ${y}) is outside the middle two-thirds`)
    if (roadStops[i] === -1) problems.push(`${where}/${provinceIds[i]}: the road misses its landmark, or reaches it out of order`)
  }
  const journeyHeight = (maps.length - 1) * step + height
  for (const [k, { x, y }] of road.entries()) {
    if (!inMiddle(x) || y < 0 || y >= journeyHeight) problems.push(`${where}: road point ${k} (${x}, ${y}) is outside the phone crop`)
    const prev = road[k - 1]
    if (prev && Math.max(Math.abs(x - prev.x), Math.abs(y - prev.y)) !== 1) {
      problems.push(`${where}: road breaks between points ${k - 1} and ${k}`)
    }
  }
  for (let i = 1; i < maps.length; i++) {
    const [top, bottom] = [i * step, (i - 1) * step + height]
    if (top < bottom && !road.some(p => p.y >= top && p.y < bottom)) problems.push(`${where}: road never crosses the overlap above ${provinceIds[i]}`)
  }
  return problems
}

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

    problems.push(...journeyProblems(c.journey, c.provinces.map(p => p.id), c.id))

    const provinceIds = new Set<string>()
    for (const p of c.provinces) {
      const where = `${c.id}/${p.id}`
      if (provinceIds.has(p.id)) problems.push(`${where}: province id is used twice`)
      provinceIds.add(p.id)
      if (!isStep(p.minSize) || !isStep(p.maxSize) || p.minSize > p.maxSize) {
        problems.push(`${where}: size band ${p.minSize}–${p.maxSize} must be multiples of 5, low to high`)
      }

      const count = p.puzzles.length
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

/** Reads, builds and structurally checks every campaign, throwing on any problem. */
export function loadCampaigns({ includeDrafts }: { includeDrafts: boolean }, dir: URL = CAMPAIGNS_DIR): Campaign[] {
  const campaigns = readCampaignSources(dir).map(buildCampaign)
  const problems = campaignProblems(campaigns)
  if (problems.length > 0) throw new Error(`invalid campaign data:\n${problems.join('\n')}`)
  return campaigns.filter(c => includeDrafts || !c.draft)
}
