import { describe, expect, it } from 'vitest'
import type { DailyYear } from '@pixel-imperium/protocol'
import { albumPages, yearAlbum, yearOfAlbum } from './album.ts'

const year: DailyYear = { year: 2026, launch: '2026-10-15', months: Array.from({ length: 12 }, () => []) }

describe('albumPages', () => {
  it('gives a Year a page for each Month from launch, counting every date to its last day', () => {
    const solved = new Set(['daily:2026-10-15', 'daily:2026-10-16'])
    const pages = albumPages(yearAlbum(year), id => solved.has(id))
    expect(pages.map(p => [p.id, p.name, p.paper, p.solved, p.total])).toEqual([
      ['10', 'October', 'autumn', 2, 17],
      ['11', 'November', 'autumn', 0, 30],
      ['12', 'December', 'winter', 0, 31],
    ])
  })

  it('completes a Month only once every date is solved', () => {
    const pages = albumPages(yearAlbum(year), id => id.startsWith('daily:2026-12-'))
    expect(pages.map(p => p.complete)).toEqual([false, false, true])
  })
})

describe('yearOfAlbum', () => {
  it('reads a Year album id, and nothing else', () => {
    expect(yearOfAlbum('daily-2027')).toBe(2027)
    expect(yearOfAlbum('realm')).toBeNull()
    expect(yearOfAlbum('daily-27')).toBeNull()
  })
})
