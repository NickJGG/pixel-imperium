import { describe, expect, it } from 'vitest'
import type { DraftCampaignDoc } from '@pixel-imperium/protocol'
import {
  HOME,
  coopTrail,
  dailyTrail,
  lessonTrail,
  madeTrail,
  playtestPuzzleTrail,
  provinceTrail,
  puzzleTrail,
  trackTrail,
} from './trails.ts'
import { TRACKS } from './tutorial/tracks.ts'

const campaign = { id: 'imperium', name: 'The Imperium', paper: 'throne' as const }
const province = { id: 'coast', name: 'The Coast', paper: 'coast' as const }
const lighthouse = { id: 'p4', title: 'Lighthouse' }

describe('trails', () => {
  it('end a province page in the province, "The " dropped', () => {
    expect(provinceTrail(campaign, province)).toEqual([
      HOME,
      { to: '/c/imperium', label: 'Imperium', paper: 'throne' },
      { to: '/c/imperium/coast', label: 'Coast', paper: 'coast' },
    ])
  })

  it('end a puzzle in its title alone, on its province paper', () => {
    const trail = puzzleTrail(campaign, province, lighthouse)
    expect(trail.map(s => s.label)).toEqual(['Home', 'Imperium', 'Coast', 'Lighthouse'])
    expect(trail.at(-1)).toEqual({ to: '/play/p4', label: 'Lighthouse', paper: 'coast' })
  })

  it('put a standalone made puzzle under the Workshop, Played by link or Home', () => {
    const made = { ...lighthouse, paper: 'forge' as const }
    expect(madeTrail('workshop', made).map(s => s.label)).toEqual(['Home', 'Workshop', 'Lighthouse'])
    expect(madeTrail('played', made)[1]).toEqual({ to: '/workshop', label: 'Played by link', paper: 'workshop', search: { tab: 'played' } })
    expect(madeTrail('home', made)).toEqual([HOME, { to: '/play/p4', label: 'Lighthouse', paper: 'forge' }])
  })

  it('end a co-op in the co-op, under its puzzle’s province when it has one', () => {
    expect(coopTrail('abc', { title: 'Lighthouse', paper: 'coast' }, { campaign, province }).map(s => s.label)).toEqual([
      'Home',
      'Imperium',
      'Coast',
      'Co-op · Lighthouse',
    ])
    expect(coopTrail('abc', { title: 'Heron', paper: 'forge' }, null)).toEqual([
      HOME,
      { to: '/co/abc', label: 'Co-op · Heron', paper: 'forge' },
    ])
    expect(coopTrail('abc', null, null)).toEqual([HOME, { to: '/co/abc', label: 'Co-op' }])
  })

  it('end a Daily in its day, under its Month in the season’s paper', () => {
    expect(dailyTrail(2026, 3, 7)).toEqual([
      HOME,
      { to: '/daily/2026/03', label: 'Daily · March', paper: 'spring' },
      { to: '/daily/2026/03/07', label: '7', paper: 'spring' },
    ])
  })

  it('put a Lesson under Learn and its track, all in the track’s paper', () => {
    const track = TRACKS.techniques
    expect(trackTrail(track).at(-1)).toEqual({ to: '/learn/techniques', label: 'Techniques', paper: 'coast' })
    const trail = lessonTrail(track, { id: 'edges', title: 'Edges' })
    expect(trail.map(s => s.label)).toEqual(['Home', 'Learn', 'Techniques', 'Edges'])
    expect(trail.slice(1).every(s => s.paper === 'coast')).toBe(true)
  })

  it('end a playtest puzzle under its draft and province', () => {
    const doc: DraftCampaignDoc = { title: '  ', paper: '#3a7d44', provinces: [], crest: null }
    expect(playtestPuzzleTrail('d1', doc, 2, { name: 'Marsh', paper: 'coast' }, 5, 'Heron')).toEqual([
      HOME,
      { to: '/workshop', label: 'Untitled', paper: '#3a7d44', search: { open: 'd1' } },
      { to: '/workshop/c/d1/playtest/2', label: 'Playtest · Marsh', paper: 'coast' },
      { to: '/workshop/c/d1/playtest/2/5', label: 'Heron', paper: 'coast' },
    ])
  })
})
