import { readFileSync } from 'node:fs'
import { isUnique, logicPassCount, rateDifficulty } from '@pixel-imperium/nonogram'
import type { CampaignMap } from '@pixel-imperium/protocol'
import { type Puzzle, type SeedPuzzle, parseSeedPuzzle } from './puzzles.ts'

/**
 * Campaign data lives in `data/campaigns/`: `index.json` lists campaign ids (first = default), and each
 * `<id>/` holds `campaign.json` (`CampaignDef`), `map.json` (`MapDef`) and one `<provinceId>.json`
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

/** `rows` is the art in palette keys, `.` = transparent; `regions.rows` tags each cell with a `regions.key` char, `.` = neutral. */
export interface MapDef {
  palette: Record<string, string>
  rows: string[]
  regions: { key: Record<string, string>; rows: string[] }
}

export interface CampaignSource {
  campaign: CampaignDef
  map: MapDef
  provinces: Record<string, SeedPuzzle[]>
}

export interface CampaignPuzzle extends Puzzle {
  campaignId: string
  provinceId: string
}

export interface Campaign extends Omit<CampaignDef, 'provinces'> {
  map: CampaignMap
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
    return { campaign, map: readJson<MapDef>(new URL('map.json', base)), provinces }
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

function parseMap(id: string, { palette, rows, regions }: MapDef, provinceIds: string[]): CampaignMap {
  const art = parseGrid(rows, `${id} map`, (ch, r) => {
    if (ch === '.') return null
    const color = palette[ch]
    if (!color) throw new Error(`${id} map row ${r} uses '${ch}', which is not in the palette`)
    return color
  })
  const tagged = parseGrid(regions.rows, `${id} regions`, (ch, r) => {
    if (ch === '.') return null
    const provinceId = regions.key[ch]
    if (provinceId === undefined) throw new Error(`${id} regions row ${r} uses '${ch}', which is not in the key`)
    const index = provinceIds.indexOf(provinceId)
    if (index === -1) throw new Error(`${id} regions key '${ch}' names unknown province '${provinceId}'`)
    return index
  })
  if (tagged.width !== art.width || regions.rows.length !== rows.length) {
    throw new Error(`${id} regions are ${tagged.width}×${regions.rows.length}, map is ${art.width}×${rows.length}`)
  }
  return { width: art.width, height: rows.length, colors: art.cells, regions: tagged.cells }
}

/** Assembles a campaign, throwing on malformed data; the campaign rules are `campaignProblems`'s job. */
export function buildCampaign({ campaign, map, provinces }: CampaignSource): Campaign {
  const provinceIds = campaign.provinces.map(p => p.id)
  return {
    ...campaign,
    map: parseMap(campaign.id, map, provinceIds),
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

    const provinceIds = new Set<string>()
    for (const [index, p] of c.provinces.entries()) {
      const where = `${c.id}/${p.id}`
      if (provinceIds.has(p.id)) problems.push(`${where}: province id is used twice`)
      provinceIds.add(p.id)
      if (!isStep(p.minSize) || !isStep(p.maxSize) || p.minSize > p.maxSize) {
        problems.push(`${where}: size band ${p.minSize}–${p.maxSize} must be multiples of 5, low to high`)
      }
      if (!c.map.regions.includes(index)) problems.push(`${where}: has no cells on the map`)

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
