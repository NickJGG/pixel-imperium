import { describe, expect, it } from 'vitest'
import type { CampaignPreview, CrestDraft, DraftCampaignDoc } from '@pixel-imperium/protocol'
import {
  MAX_PROVINCES,
  addProvince,
  appendPuzzles,
  autoRegions,
  blankCrest,
  campaignChecks,
  crestFit,
  draftAsCampaign,
  formatIn,
  keyFor,
  movePuzzle,
  paintCrest,
  paintRegion,
  parseIn,
  ready,
  regionCounts,
  removeProvince,
  resizeCrest,
  tiersOf,
} from './campaign-draft.ts'
import { blankCampaignDoc } from './workshop.ts'

const doc = (...provinces: string[][]): DraftCampaignDoc => ({
  ...blankCampaignDoc(),
  provinces: provinces.map(puzzleIds => ({ name: '', flavour: '', paper: null, puzzleIds })),
})

const ids = (d: DraftCampaignDoc) => d.provinces.map(p => p.puzzleIds)

const preview = (d: DraftCampaignDoc, tiers: [number, number] | null = null, problem?: 'fails'): CampaignPreview => ({
  provinces: d.provinces.map(p => ({
    tiers,
    puzzles: p.puzzleIds.map(id => ({ id, passes: 2, width: 10, height: 10, ...(problem && { problem }) })),
  })),
  crest: null,
})

describe('provinces and puzzles', () => {
  it('adds provinces up to six', () => {
    let d = blankCampaignDoc()
    for (let i = 0; i < 8; i++) d = addProvince(d)
    expect(d.provinces).toHaveLength(MAX_PROVINCES)
  })

  it('appends puzzles once each, up to 30', () => {
    const d = appendPuzzles(doc(['a'], ['b']), 1, ['a', 'c', 'b', 'd'])
    expect(ids(d)).toEqual([['a'], ['b', 'c', 'd']])
    const many = Array.from({ length: 40 }, (_, i) => `p${i}`)
    expect(appendPuzzles(doc([]), 0, many).provinces[0]!.puzzleIds).toHaveLength(30)
  })

  it('moves a puzzle within a province, counting the target once it has left', () => {
    expect(ids(movePuzzle(doc(['a', 'b', 'c', 'd']), { k: 0, i: 0 }, { k: 0, i: 2 }))).toEqual([['b', 'c', 'a', 'd']])
    expect(ids(movePuzzle(doc(['a', 'b', 'c', 'd']), { k: 0, i: 3 }, { k: 0, i: 0 }))).toEqual([['d', 'a', 'b', 'c']])
  })

  it('moves a puzzle onto the end of another province, unless it is full', () => {
    expect(ids(movePuzzle(doc(['a', 'b'], ['c']), { k: 0, i: 0 }, { k: 1, i: Infinity }))).toEqual([['b'], ['c', 'a']])
    const full = doc(['a'], Array.from({ length: 30 }, (_, i) => `p${i}`))
    expect(movePuzzle(full, { k: 0, i: 0 }, { k: 1, i: Infinity })).toBe(full)
  })

  it('renumbers crest regions when a province goes, its own pixels to the one before', () => {
    const d = { ...doc(['a'], ['b'], ['c']), crest: { palette: { a: '#000000' }, rows: ['aaa'], regions: ['123'] } }
    expect(removeProvince(d, 1).crest!.regions).toEqual(['112'])
    expect(removeProvince(d, 0).crest!.regions).toEqual(['112'])
  })

  it('names the province a puzzle was opened from, and reads it back', () => {
    const at = { id: 'd-0123456789abcdef', n: 3 }
    expect(formatIn(at)).toBe('d-0123456789abcdef.3')
    expect(parseIn(formatIn(at))).toEqual(at)
    for (const junk of [undefined, 3, '', 'd-1', 'd-1.', '.2', 'd-1.0', 'd-1.x', 'd.1.2', 'd-1.-2']) expect(parseIn(junk)).toBeNull()
  })
})

describe('checks', () => {
  it('wants every province filled', () => {
    expect(campaignChecks(doc(), null).filled).toBe(false)
    expect(campaignChecks(doc(['a'], []), null).filled).toBe(false)
    expect(campaignChecks(doc(['a'], ['b']), null).filled).toBe(true)
  })

  it('knows whether the puzzles pass only from a preview of these puzzles', () => {
    const d = doc(['a', 'b'])
    expect(campaignChecks(d, null).pass).toBeNull()
    expect(campaignChecks(d, preview(doc(['a']))).pass).toBeNull()
    expect(campaignChecks(d, preview(d)).pass).toBe(true)
    expect(campaignChecks(d, preview(d, null, 'fails')).pass).toBe(false)
  })

  it('wants a title and a paper', () => {
    const d = doc(['a'])
    expect(campaignChecks(d, null)).toMatchObject({ titled: false, paper: false })
    expect(campaignChecks({ ...d, title: '  ' }, null).titled).toBe(false)
    expect(campaignChecks({ ...d, title: 'Reef', paper: '#3366aa' }, null)).toMatchObject({ titled: true, paper: true })
  })

  it('is ready once everything holds, a pass still being checked aside', () => {
    const d = { ...doc(['a']), title: 'Reef', paper: '#3366aa' as const }
    expect(ready(campaignChecks(d, null))).toBe(true)
    expect(ready(campaignChecks(d, preview(d)))).toBe(true)
    expect(ready(campaignChecks(d, preview(d, null, 'fails')))).toBe(false)
    expect(ready(campaignChecks({ ...d, title: '' }, null))).toBe(false)
    expect(ready(campaignChecks({ ...d, paper: null }, null))).toBe(false)
    expect(ready(campaignChecks({ ...d, provinces: [...d.provinces, ...doc([]).provinces] }, null))).toBe(false)
  })
})

describe('tiers', () => {
  const nine = doc(Array.from({ length: 9 }, (_, i) => `p${i}`))

  it('takes the preview’s cuts from 9 puzzles on', () => {
    expect(tiersOf(nine, preview(nine, [4, 7]), 0)).toEqual([4, 7])
    const eight = doc(nine.provinces[0]!.puzzleIds.slice(0, 8))
    expect(tiersOf(eight, preview(nine, [4, 7]), 0)).toBeNull()
  })

  it('tiers the album’s puzzles by slot', () => {
    const c = draftAsCampaign('d-1', nine, preview(nine, [4, 7]), new Map())
    expect(c.provinces[0]!.puzzles.map(p => p.tier)).toEqual([
      'easy', 'easy', 'easy', 'medium', 'medium', 'medium', 'hard', 'hard', 'hard',
    ])
    expect(c.provinces[0]!.name).toBe('Province 1')
    expect(c.provinces[0]!.paper).toBe('workshop')
  })
})

describe('crest', () => {
  const crest = (rows: string[], regions = rows.map(r => r.replace(/[^.]/g, '1'))): CrestDraft => ({
    palette: { a: '#111111', b: '#222222' },
    rows,
    regions,
  })

  it('fits with a pixel per puzzle and each region the size of its province', () => {
    expect(crestFit(crest(['aa.', 'a..'], ['12.', '2..']), [1, 2])).toEqual({ pixels: 3, fits: true })
    expect(crestFit(crest(['aa.', 'a..'], ['11.', '2..']), [1, 2])).toEqual({ pixels: 3, fits: false })
    expect(crestFit(crest(['aaa']), [2])).toEqual({ pixels: 3, fits: false })
  })

  it('gives pixels to provinces in reading order, any extra to the last', () => {
    expect(autoRegions(crest(['a.a', 'aaa']), [1, 2]).regions).toEqual(['1.2', '222'])
    expect(autoRegions(crest(['aa']), [0, 1]).regions).toEqual(['22'])
  })

  it('paints holes out of both layers and fills the first province still short', () => {
    const c = crest(['aa.'], ['12.'])
    expect(paintCrest(c, 0, null, [1, 1])).toMatchObject({ rows: ['.a.'], regions: ['.2.'] })
    const holed = paintCrest(c, 0, null, [1, 1])
    expect(paintCrest(holed, 2, 'b', [1, 1])).toMatchObject({ rows: ['.ab'], regions: ['.21'] })
  })

  it('paints regions only on filled pixels', () => {
    const c = crest(['a.'], ['1.'])
    expect(paintRegion(c, 0, 1).regions).toEqual(['2.'])
    expect(paintRegion(c, 1, 1)).toBe(c)
    expect(regionCounts(paintRegion(c, 0, 1), 2)).toEqual([0, 1])
  })

  it('resizes from the bottom right, new pixels holes', () => {
    expect(resizeCrest(crest(['aa', 'aa']), 3, 1)).toMatchObject({ rows: ['aa.'], regions: ['11.'] })
  })

  it('adds a color under a fresh key, or reuses its key', () => {
    const c = crest(['a'])
    expect(keyFor(c, '#111111')).toEqual({ crest: c, key: 'a' })
    expect(keyFor(c, '#333333')!.key).toBe('c')
  })

  it('starts as square as it gets, fitting', () => {
    const c = blankCrest([3, 4], '#123456')
    expect(c.rows).toEqual(['aaa', 'aaa', 'a..'])
    expect(crestFit(c, [3, 4]).fits).toBe(true)
  })
})
