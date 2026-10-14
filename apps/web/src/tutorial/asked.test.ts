import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Province } from '@pixel-imperium/protocol'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'

describe('offers asked', () => {
  let data: Map<string, string>
  let asked: typeof import('./asked.ts')
  beforeEach(async () => {
    data = stubStorage()
    vi.resetModules()
    asked = await import('./asked.ts')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('offers the tutorial to a player never asked and with no solves', () => {
    const storage = new ProgressStorage(null)
    storage.saveCells('a', '#.', '2026-01-01T00:00:00.000Z')
    expect(asked.shouldOffer(null, storage)).toBe(true)
  })

  it('does not offer the tutorial once asked, or to a player with any solve', () => {
    const storage = new ProgressStorage(null)
    expect(asked.shouldOffer('2026-01-01T00:00:00.000Z', storage)).toBe(false)
    storage.saveSolved('a', 'local')
    expect(asked.shouldOffer(null, storage)).toBe(false)
  })

  it('offers the techniques only in the flagged province, never asked, with none done', () => {
    const province: Province = { id: 'w', name: 'W', theme: '', flavour: '', paper: 'marches', maxSize: 20, puzzles: [] }
    const flagged = { ...province, techniques: true as const }
    const none = new Set<string>()
    expect(asked.shouldOfferTechniques(null, flagged, none)).toBe(true)
    expect(asked.shouldOfferTechniques(null, province, none)).toBe(false)
    expect(asked.shouldOfferTechniques('2026-01-01T00:00:00.000Z', flagged, none)).toBe(false)
    expect(asked.shouldOfferTechniques(null, flagged, new Set(['techniques:edges']))).toBe(false)
    expect(asked.shouldOfferTechniques(null, flagged, new Set(['tutorial:overlap']))).toBe(true)
  })

  it('keeps the first time recorded, on the device', () => {
    const listener = vi.fn()
    asked.asked('tutorial').subscribe(listener)
    asked.asked('tutorial').record('2026-02-01T00:00:00.000Z')
    asked.asked('tutorial').mark()
    expect(asked.asked('tutorial').get()).toBe('2026-02-01T00:00:00.000Z')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(data.get('pixel-imperium:tutorial')).toBe('2026-02-01T00:00:00.000Z')
  })

  it('keeps each offer apart', () => {
    const tutorial = vi.fn()
    asked.asked('tutorial').subscribe(tutorial)
    asked.asked('techniques').mark()
    expect(asked.asked('techniques').get()).not.toBeNull()
    expect(asked.asked('tutorial').get()).toBeNull()
    expect(tutorial).not.toHaveBeenCalled()
  })

  it('loads what an earlier visit recorded', async () => {
    data.set('pixel-imperium:tutorial', '2026-03-01T00:00:00.000Z')
    asked.asked('techniques').mark()
    vi.resetModules()
    const reloaded = await import('./asked.ts')
    expect(reloaded.asked('tutorial').get()).toBe('2026-03-01T00:00:00.000Z')
    expect(reloaded.asked('techniques').get()).toBe(asked.asked('techniques').get())
  })
})
