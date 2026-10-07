import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign } from '@pixel-imperium/protocol'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'
import { crestsOf, latestStickers, profileStickers, showcaseFallback } from './stickers.ts'

const puzzle = (id: string) => ({ id, title: id, width: 1, height: 1, filledCount: 1 })

const campaign: Pick<Campaign, 'provinces'> = {
  provinces: [
    { id: 'a', name: 'A', theme: '', flavour: '', puzzles: [puzzle('a1'), puzzle('a2'), puzzle('a3')] },
    { id: 'b', name: 'B', theme: '', flavour: '', puzzles: [puzzle('b1'), puzzle('b2')] },
  ],
}

describe('latestStickers', () => {
  beforeEach(() => stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  const storage = new ProgressStorage('u1')
  const solve = (id: string, at: string | null, mark: 'verified' | 'unverified' = 'verified') => {
    storage.saveSolved(id, mark)
    if (at !== null) storage.saveCells(id, '#', at)
    if (mark === 'verified') storage.savePalette(id, ['#fff'])
  }

  it('lists solves latest first, undated ones last in campaign order', () => {
    solve('a1', '2026-01-01T00:00:00.000Z')
    solve('b2', '2026-03-01T00:00:00.000Z')
    solve('a2', null)
    solve('b1', null)
    storage.saveCells('a3', '.', '2026-05-01T00:00:00.000Z')
    expect(latestStickers(campaign, storage).map(s => s.puzzle.id)).toEqual(['b2', 'a1', 'a2', 'b1'])
  })

  it('places each sticker in its province and slot', () => {
    solve('b2', null)
    expect(latestStickers(campaign, storage)[0]).toMatchObject({
      province: 1,
      number: 2,
      palette: ['#fff'],
      unverified: false,
      foil: false,
    })
    storage.saveFoil('b2', true)
    expect(latestStickers(campaign, storage)[0]?.foil).toBe(true)
  })

  it('falls back to the latest stickers with art for the showcase, fewer signed out', () => {
    solve('a1', '2026-01-04T00:00:00.000Z')
    solve('a2', '2026-01-03T00:00:00.000Z', 'unverified')
    solve('a3', '2026-01-02T00:00:00.000Z')
    solve('b1', '2026-01-01T00:00:00.000Z')
    const latest = latestStickers(campaign, storage)
    expect(showcaseFallback(latest, true).map(s => s.puzzle.id)).toEqual(['a1', 'a3', 'b1'])
    expect(showcaseFallback(latest, false).map(s => s.puzzle.id)).toEqual(['a1', 'a3'])
  })
})

describe('profileStickers', () => {
  beforeEach(() => stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it("keeps the profile's order and foil, with art only where the viewer has it", () => {
    const viewer = new ProgressStorage(null)
    viewer.savePalette('a2', ['#fff'])
    viewer.saveFoil('b1', true)
    const stickers = profileStickers(campaign, { verifiedPuzzleIds: ['b1', 'gone', 'a2'], foilPuzzleIds: ['a2'] }, viewer)
    expect(stickers.map(s => [s.puzzle.id, s.province, s.number, s.palette, s.foil])).toEqual([
      ['b1', 1, 1, null, false],
      ['a2', 0, 2, ['#fff'], true],
    ])
  })
})

describe('crestsOf', () => {
  beforeEach(() => stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it("is each province's last puzzle, once its colours are known", () => {
    const storage = new ProgressStorage(null)
    storage.savePalette('b2', ['#123'])
    storage.savePalette('a2', ['#456'])
    expect(crestsOf(campaign, storage)).toEqual([null, { title: 'b2', width: 1, height: 1, palette: ['#123'] }])
  })
})
