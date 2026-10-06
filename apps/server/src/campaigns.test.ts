import { describe, expect, it } from 'vitest'
import {
  type CampaignSource,
  buildCampaign,
  campaignProblems,
  loadCampaigns,
  solverReport,
} from './campaigns.ts'
import type { SeedPuzzle } from './puzzles.ts'

const block = (id: string, width: number, height: number): SeedPuzzle => ({
  id,
  title: id,
  palette: { a: '#000' },
  rows: Array<string>(height).fill('a'.repeat(width)),
})

function source(overrides: Partial<CampaignSource['campaign']> = {}, provinces?: CampaignSource['provinces']): CampaignSource {
  return {
    campaign: {
      id: 'c',
      name: 'C',
      draft: false,
      closingLine: '',
      puzzlesPerProvince: 1,
      provinces: [
        { id: 'p', name: 'P', theme: '', flavour: '', minSize: 5, maxSize: 10 },
        { id: 'q', name: 'Q', theme: '', flavour: '', minSize: 10, maxSize: 10 },
      ],
      ...overrides,
    },
    map: { palette: { g: '#0f0' }, rows: ['g.'], regions: { key: { p: 'p', q: 'q' }, rows: ['pq'] } },
    provinces: provinces ?? { p: [block('p1', 5, 10)], q: [block('q1', 10, 10)] },
  }
}

describe('buildCampaign', () => {
  it('builds the map as colours plus province indexes', () => {
    const c = buildCampaign(source())
    expect(c.map).toEqual({ width: 2, height: 1, colors: ['#0f0', null], regions: [0, 1] })
    expect(c.provinces[1]?.puzzles[0]).toMatchObject({ id: 'q1', campaignId: 'c', provinceId: 'q', width: 10 })
  })

  it.each([
    ['an unknown map colour', { rows: ['gx'] }, /'x'.*palette/],
    ['ragged map rows', { rows: ['g.', 'g'] }, /row 1/],
    ['regions of another size', { regions: { key: { p: 'p' }, rows: ['p'] } }, /regions are 1×1, map is 2×1/],
    ['an unknown region char', { regions: { key: { p: 'p' }, rows: ['pz'] } }, /'z'.*key/],
    ['a region naming an unknown province', { regions: { key: { p: 'p', z: 'zz' }, rows: ['pz'] } }, /'zz'/],
  ])('rejects %s', (_, map, error) => {
    const s = source()
    expect(() => buildCampaign({ ...s, map: { ...s.map, ...map } })).toThrow(error)
  })
})

describe('campaignProblems', () => {
  it('passes a well-formed campaign', () => {
    expect(campaignProblems([buildCampaign(source())])).toEqual([])
  })

  it('flags puzzles outside the band or not a multiple of 5', () => {
    const c = buildCampaign(source({}, { p: [block('p1', 15, 5)], q: [block('q1', 10, 12)] }))
    expect(campaignProblems([c])).toEqual([
      'c/p/p1: width 15 must be a multiple of 5 within 5–10',
      'c/q/q1: height 12 must be a multiple of 5 within 10–10',
    ])
  })

  it('requires the full puzzle count unless draft', () => {
    const provinces = { p: [], q: [block('q1', 10, 10)] }
    expect(campaignProblems([buildCampaign(source({}, provinces))])).toEqual(['c/p: has 0 puzzles, expected 1'])
    expect(campaignProblems([buildCampaign(source({ draft: true }, provinces))])).toEqual([])
  })

  it('flags provinces missing from the map and bad bands', () => {
    const s = source()
    const c = buildCampaign({ ...s, map: { ...s.map, regions: { key: { p: 'p' }, rows: ['p.'] } } })
    expect(campaignProblems([c])).toEqual(['c/q: has no cells on the map'])
    const banded = buildCampaign(source({ provinces: [{ ...s.campaign.provinces[0]!, minSize: 10, maxSize: 5 }, s.campaign.provinces[1]!] }))
    expect(campaignProblems([banded])).toContain('c/p: size band 10–5 must be multiples of 5, low to high')
  })

  it('flags duplicate campaign and puzzle ids across campaigns', () => {
    const a = buildCampaign(source())
    const b = buildCampaign(source({}, { p: [block('p1', 5, 5)], q: [block('q1', 10, 10)] }))
    expect(campaignProblems([a, b])).toEqual([
      "c: campaign id 'c' is already used by c",
      "c/p: puzzle id 'p1' is already used by c/p",
      "c/q: puzzle id 'q1' is already used by c/q",
    ])
  })
})

describe('solverReport', () => {
  it('flags ambiguous puzzles and a difficulty drop', () => {
    const diagonal: SeedPuzzle = { id: 'diag', title: 'D', palette: { a: '#000' }, rows: ['a.', '.a'] }
    const c = buildCampaign(source({ draft: true }, { p: [diagonal, block('easy', 5, 5)], q: [] }))
    const { puzzles, problems } = solverReport(c)
    expect(puzzles.map(p => [p.id, p.unique, p.logicSolvable, p.passes])).toEqual([
      ['diag', false, false, null],
      ['easy', true, true, 1],
    ])
    expect(problems).toEqual([
      'c/p/diag: has more than one solution',
      'c/p/diag: is not solvable by line logic alone',
      'c/p/easy: rated 1, easier than diag before it (5)',
    ])
  })
})

describe('authored campaigns', () => {
  it('load and pass the structural rules', () => {
    expect(() => loadCampaigns({ includeDrafts: true })).not.toThrow()
  })

  it('leave drafts out when asked', () => {
    expect(loadCampaigns({ includeDrafts: false }).filter(c => c.draft)).toEqual([])
  })

  describe.each(loadCampaigns({ includeDrafts: true }).map(c => [c.id, c] as const))('%s', (_, campaign) => {
    it('has every puzzle unique and line-solvable, with difficulty never decreasing', () => {
      expect(solverReport(campaign).problems).toEqual([])
    })
  })
})
