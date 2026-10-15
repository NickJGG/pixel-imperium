import { readFileSync, readdirSync } from 'node:fs'
import {
  cluesFromSolution,
  hashString,
  isLogicSolvable,
  isUnique,
  mulberry32,
  rateDifficulty,
} from '@pixel-imperium/nonogram'
import { type Puzzle, type SeedPuzzle, parseSeedPuzzle } from './puzzles.ts'

/**
 * Daily data lives in `data/dailies/`: `index.json` holds `{ launch }`, the first date with a Daily, and each
 * `<year>.json` holds that Year's authored Dailies (`DailySeed[]`). Every other date from launch on gets a generated one.
 */
export const DAILIES_DIR = new URL('../data/dailies/', import.meta.url)

export const DAILY_PREFIX = 'daily:'
export const dailyId = (date: string) => `${DAILY_PREFIX}${date}`
export const dailyDate = (id: string) => (id.startsWith(DAILY_PREFIX) ? id.slice(DAILY_PREFIX.length) : null)

export interface DailySeed extends Omit<SeedPuzzle, 'id'> {
  date: string
}

export interface DailyPuzzle extends Puzzle {
  date: string
}

export interface Dailies {
  launch: string
  /** Authored Dailies by date. */
  authored: Map<string, DailyPuzzle>
}

export interface WeekdayBand {
  /** Inclusive bounds on both dimensions, multiples of 5. */
  minSize: number
  maxSize: number
  /** Inclusive `rateDifficulty` bounds. */
  difficulty: [number, number]
  /**
   * Generated fill density per side; lower is harder. Tuned by probing for the best in-band hit rate.
   * Frozen with the generator: changing one changes past Dailies.
   */
  density: Record<number, number>
}

/** Monday first. */
export const WEEKDAY_BANDS: readonly WeekdayBand[] = [
  { minSize: 5, maxSize: 10, difficulty: [1, 2], density: { 5: 0.65, 10: 0.65 } },
  { minSize: 10, maxSize: 10, difficulty: [2, 2], density: { 10: 0.6 } },
  { minSize: 10, maxSize: 15, difficulty: [2, 3], density: { 10: 0.6, 15: 0.7 } },
  { minSize: 15, maxSize: 15, difficulty: [3, 3], density: { 15: 0.55 } },
  { minSize: 15, maxSize: 20, difficulty: [3, 4], density: { 15: 0.55, 20: 0.6 } },
  { minSize: 20, maxSize: 20, difficulty: [4, 4], density: { 20: 0.55 } },
  { minSize: 20, maxSize: 25, difficulty: [4, 4], density: { 20: 0.55, 25: 0.6 } },
]

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

/** Each season's Night tab color, the one tint of a generated Daily. */
export const SEASON_TINT: Record<Season, string> = {
  winter: '#a9d8ff',
  spring: '#8fe3a6',
  summer: '#ffcf5c',
  autumn: '#ff8a5c',
}

/** Append only: a generated title is an index into this list. */
export const ABSTRACT_TITLES: readonly string[] = [
  'Static',
  'Lattice',
  'Drift',
  'Weave',
  'Ember',
  'Mosaic',
  'Ripple',
  'Thicket',
  'Scatter',
  'Bramble',
  'Circuit',
  'Frost',
  'Gravel',
  'Hatch',
  'Labyrinth',
  'Murmur',
  'Nebula',
  'Patchwork',
  'Quarry',
  'Rubble',
  'Shoal',
  'Tangle',
  'Thatch',
  'Tremor',
  'Undergrowth',
  'Vapour',
  'Warp',
  'Weft',
  'Cinder',
  'Confetti',
  'Crackle',
  'Dapple',
  'Flicker',
  'Fracture',
  'Glitter',
  'Haze',
  'Kindling',
  'Lichen',
  'Moss',
  'Noise',
  'Pebbles',
  'Prism',
  'Sleet',
  'Speckle',
  'Spindrift',
  'Swarm',
  'Terrace',
  'Tessera',
  'Tide',
  'Woodgrain',
]

const DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 24 * 60 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

/** Midnight UTC of a `YYYY-MM-DD` date, or `null` if it isn't a real one. */
export function dateStart(date: string): number | null {
  if (!DATE.test(date)) return null
  const t = Date.parse(`${date}T00:00:00Z`)
  return !isNaN(t) && new Date(t).toISOString().slice(0, 10) === date ? t : null
}

const toDate = (t: number) => new Date(t).toISOString().slice(0, 10)

/** 0 = Monday. */
export const weekdayOf = (date: string) => (new Date(dateStart(date)!).getUTCDay() + 6) % 7

export const bandFor = (date: string) => WEEKDAY_BANDS[weekdayOf(date)]!

export function seasonOf(month: number): Season {
  return month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn'
}

/** Earth's timezones run from UTC−12 to UTC+14. */
const EARLIEST_OFFSET_MS = 14 * HOUR_MS
const LATEST_OFFSET_MS = 12 * HOUR_MS
/** A Daily started on its date can be finished until 01:00 the next day. */
export const GRACE_MS = HOUR_MS

/** Whether `date` is "today" somewhere on Earth at `now`, or within the grace hour after it. */
export function isPlayableDate(date: string, now: number): boolean {
  const start = dateStart(date)
  return start !== null && now >= start - EARLIEST_OFFSET_MS && now < start + DAY_MS + LATEST_OFFSET_MS + GRACE_MS
}

/** The last date that is "today" anywhere on Earth at `now`. */
export const latestPlayableDate = (now: number) => toDate(now + EARLIEST_OFFSET_MS)

const MAX_TRIES = 1000

/**
 * Deterministic in `date`, and frozen: every past date's grid, title and tint must stay as they were, so the
 * RNG draws here (their order and count) must never change.
 */
function generate(date: string): DailyPuzzle {
  const band = bandFor(date)
  const [lo, hi] = band.difficulty
  const rng = mulberry32(hashString(date))
  const sides = Object.keys(band.density).map(Number)
  const side = sides[Math.floor(rng() * sides.length)]!
  const density = band.density[side]!
  const title = ABSTRACT_TITLES[Math.floor(rng() * ABSTRACT_TITLES.length)]!
  const tint = SEASON_TINT[seasonOf(Number(date.slice(5, 7)))]

  for (let i = 0; i < MAX_TRIES; i++) {
    const filled = Array.from({ length: side * side }, () => rng() < density)
    const clues = cluesFromSolution(side, side, filled)
    if (!isLogicSolvable(clues)) continue
    const rating = rateDifficulty(clues)
    if (rating < lo || rating > hi) continue
    const rows = Array.from({ length: side }, (_, r) =>
      filled
        .slice(r * side, (r + 1) * side)
        .map(f => (f ? '#' : '.'))
        .join(''),
    )
    return { ...parseSeedPuzzle({ id: dailyId(date), title, palette: { '#': tint }, rows }), date }
  }
  throw new Error(`${date}: no generated Daily in band after ${MAX_TRIES} tries`)
}

const generated = new Map<string, DailyPuzzle>()

export function generateDaily(date: string): DailyPuzzle {
  let p = generated.get(date)
  if (!p) generated.set(date, (p = generate(date)))
  return p
}

/** The Daily for `date`: authored if there is one, generated otherwise; `null` before launch or for a malformed date. */
export function dailyFor(dailies: Dailies, date: string): DailyPuzzle | null {
  if (dateStart(date) === null || date < dailies.launch) return null
  return dailies.authored.get(date) ?? generateDaily(date)
}

export interface DailiesSource {
  launch: string
  seeds: DailySeed[]
}

const readJson = <T>(url: URL) => JSON.parse(readFileSync(url, 'utf8')) as T

export function readDailiesSource(dir: URL = DAILIES_DIR): DailiesSource {
  const { launch } = readJson<{ launch: string }>(new URL('index.json', dir))
  const seeds = readdirSync(dir)
    .filter(f => /^\d{4}\.json$/.test(f))
    .flatMap(f => readJson<DailySeed[]>(new URL(f, dir)))
  return { launch, seeds }
}

export interface DailyReport {
  date: string
  title: string
  width: number
  height: number
  unique: boolean
  logicSolvable: boolean
  rating: number
}

/** Parses and checks the authored Dailies; any malformed seed is a problem rather than a throw. */
export function checkDailies({ launch, seeds }: DailiesSource): {
  dailies: Dailies
  reports: DailyReport[]
  problems: string[]
} {
  const problems: string[] = []
  const authored = new Map<string, DailyPuzzle>()
  const reports: DailyReport[] = []
  if (dateStart(launch) === null) problems.push(`index.json: launch '${launch}' is not a YYYY-MM-DD date`)

  for (const seed of seeds.toSorted((a, b) => (a.date < b.date ? -1 : 1))) {
    const { date } = seed
    if (dateStart(date) === null) {
      problems.push(`${date}: not a YYYY-MM-DD date`)
      continue
    }
    if (authored.has(date)) {
      problems.push(`${date}: has more than one Daily`)
      continue
    }
    if (date < launch) problems.push(`${date}: is before launch (${launch})`)
    let p: Puzzle
    try {
      p = parseSeedPuzzle({ ...seed, id: dailyId(date) })
    } catch (e) {
      problems.push((e as Error).message)
      continue
    }
    authored.set(date, { ...p, date })

    const band = bandFor(date)
    for (const [dim, n] of [['width', p.width], ['height', p.height]] as const) {
      if (n % 5 !== 0 || n < band.minSize || n > band.maxSize) {
        problems.push(`${date}: ${dim} ${n} must be a multiple of 5 within ${band.minSize}–${band.maxSize}`)
      }
    }
    const report = {
      date,
      title: p.title,
      width: p.width,
      height: p.height,
      unique: isUnique(p.clues),
      logicSolvable: isLogicSolvable(p.clues),
      rating: rateDifficulty(p.clues),
    }
    const [lo, hi] = band.difficulty
    if (report.rating < lo || report.rating > hi) problems.push(`${date}: rated ${report.rating}, outside ${lo}–${hi}`)
    if (!report.unique) problems.push(`${date}: has more than one solution`)
    if (!report.logicSolvable) problems.push(`${date}: is not solvable by line logic alone`)
    reports.push(report)
  }
  return { dailies: { launch, authored }, reports, problems }
}

/** Reads and checks the authored Dailies, throwing on any problem. */
export function loadDailies(dir: URL = DAILIES_DIR): Dailies {
  const { dailies, problems } = checkDailies(readDailiesSource(dir))
  if (problems.length > 0) throw new Error(`invalid daily data:\n${problems.join('\n')}`)
  return dailies
}

/** Dates in `month` (1–12) of `year` from launch on, up to `last` inclusive. */
export function datesInMonth(year: number, month: number, launch: string, last?: string): string[] {
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: days }, (_, i) => toDate(Date.UTC(year, month - 1, i + 1))).filter(
    d => d >= launch && (last === undefined || d <= last),
  )
}

export const monthId = (month: number) => String(month).padStart(2, '0')

/** A Year as a Stamp album: its Months, `01`–`12`, each holding its dates from launch on. */
export function yearAlbum(launch: string, year: number) {
  return {
    provinces: Array.from({ length: 12 }, (_, i) => ({
      id: monthId(i + 1),
      puzzles: datesInMonth(year, i + 1, launch).map(d => ({ id: dailyId(d) })),
    })),
  }
}
