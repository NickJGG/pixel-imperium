import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'

describe('tutorial asked', () => {
  let data: Map<string, string>
  let asked: typeof import('./asked.ts')
  beforeEach(async () => {
    data = stubStorage()
    vi.resetModules()
    asked = await import('./asked.ts')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('is offered to a player never asked and with no solves', () => {
    const storage = new ProgressStorage(null)
    storage.saveCells('a', '#.', '2026-01-01T00:00:00.000Z')
    expect(asked.shouldOffer(null, storage)).toBe(true)
  })

  it('is not offered once asked, or to a player with any solve', () => {
    const storage = new ProgressStorage(null)
    expect(asked.shouldOffer('2026-01-01T00:00:00.000Z', storage)).toBe(false)
    storage.saveSolved('a', 'local')
    expect(asked.shouldOffer(null, storage)).toBe(false)
  })

  it('keeps the first time recorded, on the device', () => {
    const listener = vi.fn()
    asked.subscribeAsked(listener)
    asked.recordAsked('2026-02-01T00:00:00.000Z')
    asked.markAsked()
    expect(asked.getAskedAt()).toBe('2026-02-01T00:00:00.000Z')
    expect(listener).toHaveBeenCalledTimes(1)
    expect([...data.values()]).toContain('2026-02-01T00:00:00.000Z')
  })

  it('loads what an earlier visit recorded', async () => {
    asked.markAsked()
    vi.resetModules()
    const reloaded = await import('./asked.ts')
    expect(reloaded.getAskedAt()).toBe(asked.getAskedAt())
    expect(reloaded.getAskedAt()).not.toBeNull()
  })
})
