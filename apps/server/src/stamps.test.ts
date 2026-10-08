import { describe, expect, it } from 'vitest'
import { buildCampaign } from './campaigns.ts'
import type { SeedPuzzle } from './puzzles.ts'
import { type StampSolve, stampsFor } from './stamps.ts'

const puzzle = (id: string): SeedPuzzle => ({ id, title: id, palette: { g: '#0f0' }, rows: ['g'] })
const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i}`)

/** Pages `a` (12 puzzles), `b` (2) and `c` (1, the last). */
const campaign = buildCampaign({
  campaign: {
    id: 'test',
    name: 'Test',
    draft: true,
    closingLine: '',
    puzzlesPerProvince: 30,
    provinces: ['a', 'b', 'c'].map(id => ({ id, name: id, theme: '', flavour: '', minSize: 5, maxSize: 5 })),
  },
  provinces: { a: ids('a', 12).map(puzzle), b: ids('b', 2).map(puzzle), c: [puzzle('c0')] },
})

const HOUR = 60 * 60 * 1000
const t0 = Date.parse('2026-01-01T00:00:00Z')
const at = (hours: number) => new Date(t0 + hours * HOUR)
const iso = (hours: number) => at(hours).toISOString()

/** One solve per id, an hour apart unless `hours` says otherwise. */
const solves = (puzzleIds: string[], foil = false, hours = puzzleIds.map((_, i) => i)): StampSolve[] =>
  puzzleIds.map((puzzleId, i) => ({ puzzleId, foil, solvedAt: at(hours[i]!) }))

const stamp = (list: StampSolve[], id: string) => stampsFor(campaign, list).find(s => s.id === id)?.earnedAt

describe('stampsFor', () => {
  it('earns nothing without solves', () => {
    expect(stampsFor(campaign, [])).toEqual([])
  })

  it('ignores solves of puzzles outside the campaign', () => {
    expect(stampsFor(campaign, solves(['elsewhere']))).toEqual([])
  })

  it('dates the first sticker and first foil by the earliest of each, whatever the input order', () => {
    const list = [...solves(['a1'], true, [5]), ...solves(['a0', 'a2'], false, [3, 1])]
    expect(stamp(list, 'first-sticker')).toBe(iso(1))
    expect(stamp(list, 'first-foil')).toBe(iso(5))
  })

  it('needs five foils in a row for the foil run, dated by the fifth', () => {
    expect(stamp(solves(ids('a', 4), true), 'foil-run')).toBeUndefined()
    expect(stamp(solves(ids('a', 5), true), 'foil-run')).toBe(iso(4))
  })

  it('breaks the foil run on a plain solve', () => {
    const list = [...solves(ids('a', 4), true), ...solves(['b0'], false, [4]), ...solves(['a4'], true, [5])]
    expect(stamp(list, 'foil-run')).toBeUndefined()
  })

  it('counts ten solves within 24 hours as a spree, dated by the tenth', () => {
    const exactly = solves(ids('a', 10), false, [0, 1, 2, 3, 4, 5, 6, 7, 8, 24])
    expect(stamp(exactly, 'spree')).toBe(iso(24))
    const over = solves(ids('a', 10), false, [0, 1, 2, 3, 4, 5, 6, 7, 8, 24.01])
    expect(stamp(over, 'spree')).toBeUndefined()
    const later = solves(ids('a', 11), false, [0, 1, 2, 3, 4, 5, 6, 7, 8, 24.01, 24.5])
    expect(stamp(later, 'spree')).toBe(iso(24.5))
  })

  it('conquers a page only once every puzzle is solved, dated by its last solve', () => {
    expect(stamp(solves(['b0']), 'conquered:b')).toBeUndefined()
    expect(stamp(solves(['b1', 'b0'], false, [7, 2]), 'conquered:b')).toBe(iso(7))
  })

  it('completes the album with the last page instead of conquering it', () => {
    const list = solves(['c0'], false, [3])
    expect(stamp(list, 'album-complete')).toBe(iso(3))
    expect(stamp(list, 'conquered:c')).toBeUndefined()
  })

  it('earns a perfect page from the first complete page that is all foil', () => {
    const plainB = solves(['b0', 'b1'], false, [0, 1])
    const foilC = solves(['c0'], true, [2])
    expect(stamp([...plainB, ...foilC], 'perfect-page')).toBe(iso(2))
    expect(stamp([...plainB, ...solves(['c0'], false, [2])], 'perfect-page')).toBeUndefined()
    expect(stamp(solves(['b0'], true), 'perfect-page')).toBeUndefined()
  })

  it('lists stamps in StampId order', () => {
    const list = [...solves(ids('a', 12), true), ...solves(['b0', 'b1', 'c0'], true, [12, 13, 14])]
    expect(stampsFor(campaign, list).map(s => s.id)).toEqual([
      'first-sticker',
      'first-foil',
      'foil-run',
      'spree',
      'perfect-page',
      'conquered:a',
      'conquered:b',
      'album-complete',
    ])
  })
})
