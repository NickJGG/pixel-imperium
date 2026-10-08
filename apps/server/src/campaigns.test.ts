import { describe, expect, it } from 'vitest'
import {
  type CampaignSource,
  buildCampaign,
  campaignProblems,
  loadCampaigns,
  solverReport,
  suggestTierCuts,
} from './campaigns.ts'
import type { SeedPuzzle } from './puzzles.ts'

const block = (id: string, width: number, height: number): SeedPuzzle => ({
  id,
  title: id,
  palette: { a: '#000' },
  rows: Array<string>(height).fill('a'.repeat(width)),
})

const three = (prefix: string, width: number, height: number, first = block(`${prefix}1`, width, height)) => [
  first,
  block(`${prefix}2`, width, height),
  block(`${prefix}3`, width, height),
]

function source(overrides: Partial<CampaignSource['campaign']> = {}, provinces?: CampaignSource['provinces']): CampaignSource {
  return {
    campaign: {
      id: 'c',
      name: 'C',
      draft: false,
      closingLine: '',
      puzzlesPerProvince: 3,
      provinces: [
        { id: 'p', name: 'P', theme: '', flavour: '', minSize: 5, maxSize: 10, tiers: [2, 3] },
        { id: 'q', name: 'Q', theme: '', flavour: '', minSize: 10, maxSize: 10, tiers: [2, 3] },
      ],
      ...overrides,
    },
    provinces: provinces ?? { p: three('p', 5, 10), q: three('q', 10, 10) },
  }
}

describe('buildCampaign', () => {
  it('tags each puzzle with its campaign and province', () => {
    const c = buildCampaign(source())
    expect(c.provinces[1]?.puzzles[0]).toMatchObject({ id: 'q1', campaignId: 'c', provinceId: 'q', width: 10 })
  })

  it('assigns tiers by slot from the cuts', () => {
    const c = buildCampaign(source())
    expect(c.provinces[0]?.puzzles.map(p => p.tier)).toEqual(['easy', 'medium', 'hard'])
  })
})

describe('campaignProblems', () => {
  it('passes a well-formed campaign', () => {
    expect(campaignProblems([buildCampaign(source())])).toEqual([])
  })

  it('flags puzzles outside the band or not a multiple of 5', () => {
    const c = buildCampaign(source({}, { p: three('p', 5, 5, block('p1', 15, 5)), q: three('q', 10, 10, block('q1', 10, 12)) }))
    expect(campaignProblems([c])).toEqual([
      'c/p/p1: width 15 must be a multiple of 5 within 5–10',
      'c/q/q1: height 12 must be a multiple of 5 within 10–10',
    ])
  })

  it('requires the full puzzle count unless draft', () => {
    const s = source()
    const untiered = { provinces: s.campaign.provinces.map(({ tiers: _, ...p }) => p) }
    const provinces = { p: [], q: three('q', 10, 10) }
    expect(campaignProblems([buildCampaign(source(untiered, provinces))])).toEqual([
      'c/p: needs tiers',
      'c/p: has 0 puzzles, expected 3',
      'c/q: needs tiers',
    ])
    expect(campaignProblems([buildCampaign(source({ ...untiered, draft: true }, provinces))])).toEqual([])
  })

  it.each([[[1, 3]], [[3, 3]], [[3, 2]], [[2, 4]], [[2.5, 3]], [[2]]])('rejects tiers %j', tiers => {
    const s = source()
    const c = buildCampaign(
      source({ draft: true, provinces: [{ ...s.campaign.provinces[0]!, tiers: tiers as [number, number] }, s.campaign.provinces[1]!] }),
    )
    expect(campaignProblems([c])).toEqual(['c/p: tiers [m, h] must be slots with 2 ≤ medium < hard ≤ 3'])
  })

  it('flags bad bands', () => {
    const s = source()
    const banded = buildCampaign(source({ provinces: [{ ...s.campaign.provinces[0]!, minSize: 10, maxSize: 5 }, s.campaign.provinces[1]!] }))
    expect(campaignProblems([banded])).toContain('c/p: size band 10–5 must be multiples of 5, low to high')
  })

  it('allows at most one province offering techniques', () => {
    const s = source()
    const flag = (n: number) =>
      buildCampaign(source({ provinces: s.campaign.provinces.map((p, i) => (i < n ? { ...p, techniques: true as const } : p)) }))
    expect(campaignProblems([flag(1)])).toEqual([])
    expect(campaignProblems([flag(2)])).toEqual(['c: more than one province offers techniques'])
  })

  it('flags duplicate campaign and puzzle ids across campaigns', () => {
    const a = buildCampaign(source())
    const b = buildCampaign(source({}, { p: three('x', 5, 5, block('p1', 5, 5)), q: three('y', 10, 10, block('q1', 10, 10)) }))
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

describe('suggestTierCuts', () => {
  const sized = (passes: (number | null)[]) => passes.map(p => ({ width: 5, height: 5, passes: p }))

  it('cuts a stepped sequence at its steps', () => {
    expect(suggestTierCuts(sized([1, 1, 1, 1, 5, 5, 5, 5, 9, 9, 9, 9]))).toEqual([5, 9])
  })

  it('never lets a dip start a band early', () => {
    expect(suggestTierCuts(sized([1, 1, 1, 6, 1, 6, 6, 6, 9, 9, 9, 9]))).toEqual([4, 9])
  })

  it('gives no suggestion for too few or unsolvable puzzles', () => {
    expect(suggestTierCuts(sized([1, 1, 1, 2, 2, 2, 3, 3]))).toBeNull()
    expect(suggestTierCuts(sized([1, 1, 1, 2, null, 2, 3, 3, 3]))).toBeNull()
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

    it('has tier cuts matching the suggested ones', () => {
      const { puzzles } = solverReport(campaign)
      for (const p of campaign.provinces) {
        expect([p.id, suggestTierCuts(puzzles.filter(x => x.provinceId === p.id))]).toEqual([p.id, p.tiers])
      }
    })
  })
})
