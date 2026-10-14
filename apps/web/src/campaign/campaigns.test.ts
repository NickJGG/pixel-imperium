import { describe, expect, it } from 'vitest'
import { featuredUntil, isFeatured, jump, newestFeatured, rowOrder, windowOf } from './campaigns.ts'

describe('featured', () => {
  it('lasts 30 days past the release, across a month and a year', () => {
    expect(featuredUntil('2026-10-14')).toBe('2026-11-13')
    expect(featuredUntil('2026-12-15')).toBe('2027-01-14')
  })

  it('counts the release day as day 0 and day 30 as the last', () => {
    const c = { released: '2026-10-01' }
    expect(isFeatured(c, '2026-09-30')).toBe(false)
    expect(isFeatured(c, '2026-10-01')).toBe(true)
    expect(isFeatured(c, '2026-10-31')).toBe(true)
    expect(isFeatured(c, '2026-11-01')).toBe(false)
  })

  it('never features a campaign without a release date', () => {
    expect(isFeatured({}, '2026-10-01')).toBe(false)
  })
})

describe('newestFeatured', () => {
  const today = '2026-10-14'
  const old = { id: 'old', released: '2025-01-01' }
  const earlier = { id: 'earlier', released: '2026-09-20' }
  const newest = { id: 'newest', released: '2026-10-10' }

  it('picks the newest of two Featured at once', () => {
    expect(newestFeatured([old, newest, earlier], new Set(), today)).toBe(newest)
  })

  it('gives none once the newest is started, not even the older one', () => {
    expect(newestFeatured([old, newest, earlier], new Set(['newest']), today)).toBeUndefined()
  })

  it('gives none once the window has passed', () => {
    expect(newestFeatured([old, newest], new Set(), '2026-11-09')).toBe(newest)
    expect(newestFeatured([old, newest], new Set(), '2026-11-10')).toBeUndefined()
  })

  it('gives none with nothing Featured', () => {
    expect(newestFeatured([old, { id: 'draft' }], new Set(), today)).toBeUndefined()
  })
})

describe('rowOrder', () => {
  const today = '2026-10-14'
  const ids = (cs: { id: string }[]) => cs.map(c => c.id)

  it('puts started campaigns first, then featured ones, then the rest, each by release', () => {
    const summaries = [
      { id: 'old', released: '2025-01-01' },
      { id: 'new', released: '2026-10-10' },
      { id: 'mid', released: '2026-03-01' },
      { id: 'started-late', released: '2026-06-01' },
      { id: 'started-early', released: '2025-06-01' },
    ]
    expect(ids(rowOrder(summaries, new Set(['started-late', 'started-early']), today))).toEqual([
      'started-early',
      'started-late',
      'new',
      'old',
      'mid',
    ])
  })

  it('keeps a featured campaign that was started among the started ones', () => {
    const summaries = [
      { id: 'a', released: '2025-01-01' },
      { id: 'new', released: '2026-10-10' },
    ]
    expect(ids(rowOrder(summaries, new Set(['new', 'a']), today))).toEqual(['a', 'new'])
  })

  it('breaks ties by list order and puts undated drafts last', () => {
    const summaries = [{ id: 'draft' }, { id: 'b', released: '2025-01-01' }, { id: 'a', released: '2025-01-01' }]
    expect(ids(rowOrder(summaries, new Set(), today))).toEqual(['b', 'a', 'draft'])
  })
})

describe('windowOf', () => {
  it('shows the whole row when it fits', () => {
    expect(windowOf(4, 2)).toEqual({ lo: 0, hi: 4 })
  })

  it('centres on the open column', () => {
    expect(windowOf(20, 10)).toEqual({ lo: 7, hi: 14 })
  })

  it('pins at either end', () => {
    expect(windowOf(20, 1)).toEqual({ lo: 0, hi: 7 })
    expect(windowOf(20, 18)).toEqual({ lo: 13, hi: 20 })
  })
})

describe('jump', () => {
  it('moves a whole window, clamped to the row', () => {
    expect(jump(10, 1, 20)).toBe(17)
    expect(jump(10, -1, 20)).toBe(3)
    expect(jump(15, 1, 20)).toBe(19)
    expect(jump(4, -1, 20)).toBe(0)
  })
})
