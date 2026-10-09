import { readFileSync } from 'node:fs'
import type { Tier } from '@pixel-imperium/protocol'
import { isUnique, logicPassCount, rateDifficulty } from '@pixel-imperium/nonogram'
import { type Puzzle, type SeedPuzzle, parseSeedPuzzle } from './puzzles.ts'

/**
 * Campaign data lives in `data/campaigns/`: `index.json` lists campaign ids (first = default), and each
 * `<id>/` holds `campaign.json` (`CampaignDef`) and one `<provinceId>.json` (`SeedPuzzle[]`, easiest
 * first) per province.
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
  /** 1-based slots where Medium and Hard start; required outside drafts. */
  tiers?: [number, number]
  /** Offer the Techniques when this province starts; at most one per campaign. */
  techniques?: true
}

export interface CampaignDef {
  id: string
  name: string
  /** Served outside production only, and exempt from the puzzle count. */
  draft: boolean
  closingLine: string
  /** CSS colour for the volume's spine; cobalt when absent. */
  coverColour?: string
  puzzlesPerProvince: number
  provinces: ProvinceDef[]
}

export interface CampaignSource {
  campaign: CampaignDef
  provinces: Record<string, SeedPuzzle[]>
}

export interface CampaignPuzzle extends Puzzle {
  campaignId: string
  provinceId: string
  tier?: Tier
}

export interface Campaign extends Omit<CampaignDef, 'provinces'> {
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
    return { campaign, provinces }
  })
}

/** Assembles a campaign, throwing on malformed data; the campaign rules are `campaignProblems`'s job. */
export function buildCampaign({ campaign, provinces }: CampaignSource): Campaign {
  return {
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
}

const tierAt = (slot: number, [medium, hard]: [number, number]): Tier =>
  slot >= hard ? 'hard' : slot >= medium ? 'medium' : 'easy'

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

    if (c.provinces.filter(p => p.techniques).length > 1) problems.push(`${c.id}: more than one province offers techniques`)
    const provinceIds = new Set<string>()
    for (const p of c.provinces) {
      const where = `${c.id}/${p.id}`
      if (provinceIds.has(p.id)) problems.push(`${where}: province id is used twice`)
      provinceIds.add(p.id)
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

/** Reads, builds and structurally checks every campaign, throwing on any problem. */
export function loadCampaigns({ includeDrafts }: { includeDrafts: boolean }, dir: URL = CAMPAIGNS_DIR): Campaign[] {
  const campaigns = readCampaignSources(dir).map(buildCampaign)
  const problems = campaignProblems(campaigns)
  if (problems.length > 0) throw new Error(`invalid campaign data:\n${problems.join('\n')}`)
  return campaigns.filter(c => includeDrafts || !c.draft)
}
