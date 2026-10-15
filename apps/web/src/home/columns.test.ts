import { describe, expect, it } from 'vitest'
import { TRACKS, lessonKey } from '../tutorial/tracks.ts'
import { columnsFor, homeSearch, learnPapers, openColumn, papers, searchFor, stepColumn } from './columns.ts'

const finished = (...tracks: (typeof TRACKS)[keyof typeof TRACKS][]) =>
  new Set(tracks.flatMap(t => t.lessons.map(l => lessonKey(t, l))))

describe('columnsFor', () => {
  it('offers Profile and Settings signed in, Sign in signed out', () => {
    expect(columnsFor(true, true)).toEqual(['campaign', 'daily', 'learn', 'workshop', 'profile', 'settings'])
    expect(columnsFor(false, true)).toEqual(['campaign', 'daily', 'learn', 'signin'])
  })

  it('leaves Daily out until it has launched', () => {
    expect(columnsFor(true, false)).toEqual(['campaign', 'learn', 'workshop', 'profile', 'settings'])
    expect(columnsFor(false, false)).toEqual(['campaign', 'learn', 'signin'])
  })

  it('puts a Featured campaign right after Campaign', () => {
    expect(columnsFor(true, true, true)).toEqual(['campaign', 'featured', 'daily', 'learn', 'workshop', 'profile', 'settings'])
    expect(columnsFor(false, false, true)).toEqual(['campaign', 'featured', 'learn', 'signin'])
  })
})

describe('homeSearch', () => {
  it('keeps a column it knows and drops anything else', () => {
    expect(homeSearch({ open: 'learn' })).toEqual({ open: 'learn' })
    expect(homeSearch({ open: 'daily' })).toEqual({ open: 'daily' })
    expect(homeSearch({ open: 'featured' })).toEqual({ open: 'featured' })
    expect(homeSearch({ open: 'workshop' })).toEqual({ open: 'workshop' })
    expect(homeSearch({ open: 'campaign' })).toEqual({})
    expect(homeSearch({ open: 'shop' })).toEqual({})
    expect(homeSearch({ open: 3 })).toEqual({})
  })
})

describe('openColumn', () => {
  it('opens the named column, or Campaign when the menu lacks it', () => {
    expect(openColumn(columnsFor(true, true), { open: 'settings' })).toBe('settings')
    expect(openColumn(columnsFor(false, true), { open: 'settings' })).toBe('campaign')
    expect(openColumn(columnsFor(true, true), {})).toBe('campaign')
    expect(openColumn(columnsFor(false, true), { open: 'workshop' })).toBe('campaign')
  })

  it('falls back to Campaign once the Featured column has gone', () => {
    expect(openColumn(columnsFor(true, true, true), { open: 'featured' })).toBe('featured')
    expect(openColumn(columnsFor(true, true), { open: 'featured' })).toBe('campaign')
  })

  it('round-trips through searchFor', () => {
    for (const c of columnsFor(true, true, true)) expect(openColumn(columnsFor(true, true, true), searchFor(c))).toBe(c)
  })
})

describe('stepColumn', () => {
  it('steps to a neighbour and stops at the ends', () => {
    const columns = columnsFor(true, true)
    expect(stepColumn(columns, 'learn', 1)).toBe('workshop')
    expect(stepColumn(columns, 'workshop', 1)).toBe('profile')
    expect(stepColumn(columns, 'learn', -1)).toBe('daily')
    expect(stepColumn(columns, 'campaign', 1)).toBe('daily')
    expect(stepColumn(columns, 'campaign', -1)).toBeUndefined()
    expect(stepColumn(columns, 'settings', 1)).toBeUndefined()
  })

  it('steps through the Featured column between Campaign and Daily', () => {
    const columns = columnsFor(true, true, true)
    expect(stepColumn(columns, 'campaign', 1)).toBe('featured')
    expect(stepColumn(columns, 'featured', 1)).toBe('daily')
    expect(stepColumn(columns, 'daily', -1)).toBe('featured')
  })
})

describe('learnPapers', () => {
  it('puts the track of the next Lesson first', () => {
    expect(learnPapers(new Set())).toEqual(['marches', 'coast'])
    expect(learnPapers(finished(TRACKS.tutorial))).toEqual(['coast', 'marches'])
  })

  it('goes back to Basics once both are finished', () => {
    expect(learnPapers(finished(TRACKS.tutorial, TRACKS.techniques))).toEqual(['marches', 'coast'])
  })
})

describe('papers', () => {
  it('dresses each column for where it leads', () => {
    expect(papers('wildwood', ['coast', 'marches'], 'autumn')).toEqual({
      campaign: 'wildwood',
      featured: 'wildwood',
      daily: 'autumn',
      learn: 'coast',
      workshop: 'workshop',
      profile: 'cover',
      settings: 'capital',
      signin: 'throne',
    })
  })

  it('moves Learn to its other track rather than match Campaign', () => {
    expect(papers('marches', ['marches', 'coast'], 'winter').learn).toBe('coast')
    expect(papers('coast', ['coast', 'marches'], 'winter').learn).toBe('marches')
  })

  it('moves Settings and Sign in to the Forge rather than match Campaign', () => {
    expect(papers('capital', ['marches', 'coast'], 'winter').settings).toBe('forge')
    expect(papers('throne', ['marches', 'coast'], 'winter')).toMatchObject({ settings: 'capital', signin: 'forge' })
  })

  it('dresses the Featured column in its campaign paper', () => {
    expect(papers('throne', ['marches', 'coast'], 'winter', 'wildwood').featured).toBe('wildwood')
  })

  it('moves Settings and Sign in to the Forge rather than match Featured', () => {
    expect(papers('wildwood', ['marches', 'coast'], 'winter', 'capital').settings).toBe('forge')
    expect(papers('wildwood', ['marches', 'coast'], 'winter', 'throne')).toMatchObject({ settings: 'capital', signin: 'forge' })
  })

  it('moves Settings and Sign in to the Forge rather than match Learn', () => {
    expect(papers('marches', ['capital', 'coast'], 'winter').settings).toBe('forge')
    expect(papers('marches', ['throne', 'coast'], 'winter').signin).toBe('forge')
  })
})
