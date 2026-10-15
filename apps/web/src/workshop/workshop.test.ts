import { describe, expect, it } from 'vitest'
import type { Made, MadePuzzleSummary } from '@pixel-imperium/protocol'
import type { StoredDraft } from '../make/draft-store.ts'
import { blankDraft } from '../make/draft.ts'
import { allPuzzles, findPuzzles, mergeDrafts, workshopSearch, yourCampaigns, yourPuzzles } from './workshop.ts'

const server = (id: string, title: string, updatedAt: string) => ({ id, title, width: 5, height: 5, paper: null, updatedAt })

const stored = (title: string, updatedAt: string, unsent: boolean, size = 5): StoredDraft => ({
  draft: { ...blankDraft(size, size), title },
  paper: null,
  updatedAt,
  unsent,
})

const published = (id: string, title: string, createdAt: string, more: Partial<MadePuzzleSummary> = {}): MadePuzzleSummary => ({
  id,
  title,
  width: 10,
  height: 10,
  filledCount: 1,
  palette: [],
  paper: null,
  campaignId: null,
  createdAt,
  ...more,
})

const made = (...puzzles: MadePuzzleSummary[]): Made => ({ puzzles, campaigns: [] })

describe('mergeDrafts', () => {
  it('takes this device’s copy where it is newer, and keeps its unsent drafts', () => {
    const merged = mergeDrafts(
      [server('d-a', 'Old title', '2026-01-02T00:00:00Z'), server('d-b', 'Server', '2026-01-05T00:00:00Z')],
      new Map([
        ['d-a', stored('New title', '2026-01-04T00:00:00Z', true)],
        ['d-b', stored('Stale', '2026-01-01T00:00:00Z', false)],
        ['d-c', stored('Unsent', '2026-01-03T00:00:00Z', true)],
      ]),
    )
    expect(merged.map(d => [d.id, d.title])).toEqual([
      ['d-b', 'Server'],
      ['d-a', 'New title'],
      ['d-c', 'Unsent'],
    ])
  })

  it('drops a sent copy the server no longer has: published or deleted since', () => {
    expect(mergeDrafts([], new Map([['d-gone', stored('Gone', '2026-01-01T00:00:00Z', false)]]))).toEqual([])
  })
})

describe('yourPuzzles', () => {
  it('mixes drafts and live published puzzles, newest first', () => {
    const drafts = mergeDrafts([server('d-a', 'Draft', '2026-01-02T00:00:00Z')], new Map())
    const entries = yourPuzzles(
      drafts,
      made(
        published('aaaaaaaaa1', 'Live', '2026-01-03T00:00:00Z'),
        published('aaaaaaaaa2', 'Retired', '2026-01-04T00:00:00Z', { retired: true }),
        published('aaaaaaaaa3', 'Removed', '2026-01-05T00:00:00Z', { removed: true }),
      ),
    )
    expect(entries.map(e => (e.kind === 'draft' ? e.title : e.puzzle.title))).toEqual(['Live', 'Draft'])
  })
})

describe('findPuzzles', () => {
  const drafts = mergeDrafts([], new Map([['d-a', stored('Big Lighthouse', '2026-01-02T00:00:00Z', true, 20)]]))
  const entries = allPuzzles(
    drafts,
    made(
      published('aaaaaaaaa1', 'Small frog', '2026-01-03T00:00:00Z'),
      published('aaaaaaaaa2', 'Old house', '2026-01-01T00:00:00Z', { retired: true }),
    ),
  )
  const titles = (q: Parameters<typeof findPuzzles>[1]) =>
    findPuzzles(entries, q).map(e => (e.kind === 'draft' ? e.title : e.puzzle.title))

  it('matches every word of the search in the title', () => {
    expect(titles({ query: 'house light', filter: 'all', sort: 'newest' })).toEqual(['Big Lighthouse'])
    expect(titles({ query: 'house frog', filter: 'all', sort: 'newest' })).toEqual([])
    expect(titles({ query: 'HOUSE', filter: 'all', sort: 'newest' })).toEqual(['Big Lighthouse', 'Old house'])
  })

  it('filters by kind, retired apart from published', () => {
    expect(titles({ query: '', filter: 'drafts', sort: 'newest' })).toEqual(['Big Lighthouse'])
    expect(titles({ query: '', filter: 'published', sort: 'newest' })).toEqual(['Small frog'])
    expect(titles({ query: '', filter: 'retired', sort: 'newest' })).toEqual(['Old house'])
  })

  it('sorts biggest first, newest first among equals', () => {
    expect(titles({ query: '', filter: 'all', sort: 'size' })).toEqual(['Big Lighthouse', 'Small frog', 'Old house'])
  })
})

describe('yourCampaigns', () => {
  it('lists live published campaigns, then drafts', () => {
    const campaign = (id: string, more = {}) => ({ id, title: id, paper: '#ff0000' as const, total: 3, createdAt: '2026-01-01T00:00:00Z', ...more })
    const entries = yourCampaigns({
      made: { puzzles: [], campaigns: [campaign('live'), campaign('retired', { retired: true })] },
      drafts: { puzzles: [], campaigns: [{ id: 'd-x', title: '', paper: null, updatedAt: '2026-01-02T00:00:00Z' }] },
    })
    expect(entries.map(e => [e.kind, e.campaign.id])).toEqual([
      ['published', 'live'],
      ['draft', 'd-x'],
    ])
  })
})

describe('workshopSearch', () => {
  it('keeps Played and an open column, and drops anything else', () => {
    expect(workshopSearch({ tab: 'played', open: 'abc' })).toEqual({ tab: 'played', open: 'abc' })
    expect(workshopSearch({ tab: 'yours', open: '' })).toEqual({})
    expect(workshopSearch({ open: 3 })).toEqual({})
  })
})
