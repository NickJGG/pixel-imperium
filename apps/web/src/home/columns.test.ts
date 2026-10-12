import { describe, expect, it } from 'vitest'
import { TRACKS, lessonKey } from '../tutorial/tracks.ts'
import { columnsFor, homeSearch, learnPapers, openColumn, papers, searchFor, stepColumn } from './columns.ts'

const finished = (...tracks: (typeof TRACKS)[keyof typeof TRACKS][]) =>
  new Set(tracks.flatMap(t => t.lessons.map(l => lessonKey(t, l))))

describe('columnsFor', () => {
  it('offers Profile and Settings signed in, Sign in signed out', () => {
    expect(columnsFor(true)).toEqual(['campaign', 'learn', 'profile', 'settings'])
    expect(columnsFor(false)).toEqual(['campaign', 'learn', 'signin'])
  })
})

describe('homeSearch', () => {
  it('keeps a column it knows and drops anything else', () => {
    expect(homeSearch({ open: 'learn' })).toEqual({ open: 'learn' })
    expect(homeSearch({ open: 'campaign' })).toEqual({})
    expect(homeSearch({ open: 'shop' })).toEqual({})
    expect(homeSearch({ open: 3 })).toEqual({})
  })
})

describe('openColumn', () => {
  it('opens the named column, or Campaign when the menu lacks it', () => {
    expect(openColumn(columnsFor(true), { open: 'settings' })).toBe('settings')
    expect(openColumn(columnsFor(false), { open: 'settings' })).toBe('campaign')
    expect(openColumn(columnsFor(true), {})).toBe('campaign')
  })

  it('round-trips through searchFor', () => {
    for (const c of columnsFor(true)) expect(openColumn(columnsFor(true), searchFor(c))).toBe(c)
  })
})

describe('stepColumn', () => {
  it('steps to a neighbour and stops at the ends', () => {
    const columns = columnsFor(true)
    expect(stepColumn(columns, 'learn', 1)).toBe('profile')
    expect(stepColumn(columns, 'learn', -1)).toBe('campaign')
    expect(stepColumn(columns, 'campaign', -1)).toBeUndefined()
    expect(stepColumn(columns, 'settings', 1)).toBeUndefined()
  })
})

describe('learnPapers', () => {
  it('puts the track of the next Lesson first', () => {
    expect(learnPapers(new Set())).toEqual([0, 1])
    expect(learnPapers(finished(TRACKS.tutorial))).toEqual([1, 0])
  })

  it('goes back to Basics once both are finished', () => {
    expect(learnPapers(finished(TRACKS.tutorial, TRACKS.techniques))).toEqual([0, 1])
  })
})

describe('papers', () => {
  it('dresses each column for where it leads', () => {
    expect(papers(2, [1, 0])).toEqual({ campaign: 2, learn: 1, profile: 'cover', settings: 4, signin: 5 })
  })

  it('moves Learn to its other track rather than match Campaign', () => {
    expect(papers(0, [0, 1]).learn).toBe(1)
    expect(papers(1, [1, 0]).learn).toBe(0)
  })

  it('moves Settings and Sign in to the Forge rather than match Campaign', () => {
    expect(papers(4, [0, 1]).settings).toBe(3)
    expect(papers(5, [0, 1]).signin).toBe(3)
  })
})
