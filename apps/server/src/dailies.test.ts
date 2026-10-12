import { describe, expect, it } from 'vitest'
import { hashString, isLogicSolvable, rateDifficulty } from '@pixel-imperium/nonogram'
import {
  type DailySeed,
  bandFor,
  checkDailies,
  dailyFor,
  generateDaily,
  isPlayableDate,
  latestPlayableDate,
  readDailiesSource,
  yearAlbum,
} from './dailies.ts'

const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)
const picture = (colors: readonly (string | null)[]) => colors.map(c => (c ? '#' : '.')).join('')

describe('generateDaily', () => {
  // Frozen: a failure here means past Dailies changed behind Stickers already earned.
  it('pins a generated grid row by row', () => {
    const p = generateDaily('2026-10-19')
    expect(p).toMatchObject({ id: 'daily:2026-10-19', date: '2026-10-19', title: 'Quarry', width: 10, height: 10 })
    expect(picture(p.palette).match(/.{10}/g)).toEqual([
      '.#.#..#.#.',
      '.#.##....#',
      '.#..#.##.#',
      '##.####..#',
      '##..#.#.##',
      '.###.##.#.',
      '###...##..',
      '##..##.###',
      '..#####.#.',
      '.######.##',
    ])
  })

  it.each([
    ['2026-10-15', 'Haze', 15, '#ff8a5c', -1752698036],
    ['2026-12-20', 'Bramble', 25, '#a9d8ff', 985383386],
    ['2027-01-16', 'Woodgrain', 20, '#a9d8ff', -146574913],
    ['2027-03-02', 'Weave', 10, '#8fe3a6', 1280820598],
    ['2027-07-09', 'Tessera', 15, '#ffcf5c', -2127428042],
  ])('pins %s', (date, title, side, tint, grid) => {
    const p = generateDaily(date)
    expect({ title: p.title, width: p.width, height: p.height }).toEqual({ title, width: side, height: side })
    expect(new Set(p.palette.filter(c => c !== null))).toEqual(new Set([tint]))
    expect(hashString(picture(p.palette))).toBe(grid)
  })

  it('keeps every date over two years in its weekday band and line-solvable', () => {
    for (let i = 0; i < 730; i++) {
      const date = addDays('2026-10-01', i)
      const p = generateDaily(date)
      const band = bandFor(date)
      const rating = rateDifficulty(p.clues)
      expect(isLogicSolvable(p.clues), date).toBe(true)
      expect(rating, date).toBeGreaterThanOrEqual(band.difficulty[0])
      expect(rating, date).toBeLessThanOrEqual(band.difficulty[1])
      expect(p.width, date).toBeGreaterThanOrEqual(band.minSize)
      expect(p.width, date).toBeLessThanOrEqual(band.maxSize)
    }
  }, 60_000)
})

const seed = (date: string, rows: string[]): DailySeed => ({
  date,
  title: date,
  palette: { '#': '#000' },
  rows,
})
/** A 5×5 Monday picture, rated 1, unique and line-solvable. */
const acorn = ['.###.', '#####', '.###.', '.###.', '..#..']

describe('checkDailies', () => {
  it('passes the authored data', () => {
    expect(checkDailies(readDailiesSource()).problems).toEqual([])
  })

  it('reports malformed dates, duplicates, dates before launch and pictures out of band', () => {
    const { problems } = checkDailies({
      launch: '2026-10-01',
      seeds: ['2026-13-01', '2026-09-28', '2026-10-05', '2026-10-05', '2026-10-06'].map(d => seed(d, acorn)),
    })
    expect(problems).toEqual([
      '2026-09-28: is before launch (2026-10-01)',
      '2026-10-05: has more than one Daily',
      '2026-10-06: width 5 must be a multiple of 5 within 10–10',
      '2026-10-06: height 5 must be a multiple of 5 within 10–10',
      '2026-10-06: rated 1, outside 2–2',
      '2026-13-01: not a YYYY-MM-DD date',
    ])
  })

  it('reports ambiguous pictures', () => {
    const diagonal = ['#....', '.#...', '..#..', '...#.', '....#']
    expect(checkDailies({ launch: '2026-10-01', seeds: [seed('2026-10-05', diagonal)] }).problems).toEqual(
      expect.arrayContaining(['2026-10-05: has more than one solution', '2026-10-05: is not solvable by line logic alone']),
    )
  })
})

describe('dailyFor', () => {
  const { dailies } = checkDailies({ launch: '2026-10-01', seeds: [seed('2026-10-05', acorn)] })

  it('prefers the authored Daily and generates the rest', () => {
    expect(dailyFor(dailies, '2026-10-05')?.title).toBe('2026-10-05')
    expect(dailyFor(dailies, '2026-10-19')).toBe(generateDaily('2026-10-19'))
  })

  it('has nothing before launch or for a malformed date', () => {
    expect(dailyFor(dailies, '2026-09-30')).toBeNull()
    expect(dailyFor(dailies, '2026-10-32')).toBeNull()
    expect(dailyFor(dailies, 'tomorrow')).toBeNull()
  })
})

describe('isPlayableDate', () => {
  const midnight = Date.parse('2026-10-12T00:00:00Z')

  it('opens when the date starts at UTC+14', () => {
    expect(isPlayableDate('2026-10-12', midnight - 14 * HOUR - 1)).toBe(false)
    expect(isPlayableDate('2026-10-12', midnight - 14 * HOUR)).toBe(true)
  })

  it('closes an hour after the date ends at UTC−12', () => {
    expect(isPlayableDate('2026-10-12', midnight + DAY + 13 * HOUR - 1)).toBe(true)
    expect(isPlayableDate('2026-10-12', midnight + DAY + 13 * HOUR)).toBe(false)
  })

  it('rejects malformed dates', () => {
    expect(isPlayableDate('2026-02-30', midnight)).toBe(false)
  })

  it('names the last date open anywhere', () => {
    expect(latestPlayableDate(midnight + 10 * HOUR - 1)).toBe('2026-10-12')
    expect(latestPlayableDate(midnight + 10 * HOUR)).toBe('2026-10-13')
  })
})

describe('yearAlbum', () => {
  it('holds each Month’s dates from launch on, as Daily ids', () => {
    const { provinces } = yearAlbum('2026-10-20', 2026)
    expect(provinces.map(p => p.id)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'])
    expect(provinces[8]!.puzzles).toEqual([])
    expect(provinces[9]!.puzzles.map(p => p.id)).toEqual(
      Array.from({ length: 12 }, (_, i) => `daily:2026-10-${20 + i}`),
    )
    expect(provinces[1]!.puzzles).toEqual([])
    expect(yearAlbum('2026-10-20', 2028).provinces[1]!.puzzles).toHaveLength(29)
  })
})
