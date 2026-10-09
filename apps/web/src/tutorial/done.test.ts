import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubStorage } from '../test-storage.ts'

describe('lessons done', () => {
  let data: Map<string, string>
  let done: typeof import('./done.ts')
  beforeEach(async () => {
    data = stubStorage()
    vi.resetModules()
    done = await import('./done.ts')
  })
  afterEach(() => vi.unstubAllGlobals())

  it('starts empty', () => {
    expect(done.getDone().size).toBe(0)
  })

  it('unions keys in, notifying only when one is new', () => {
    const listener = vi.fn()
    done.subscribeDone(listener)
    done.markDone('tutorial:overlap')
    const after = done.getDone()
    done.recordDone(['tutorial:overlap'])
    done.recordDone(['tutorial:overlap', 'techniques:edges'])
    expect([...done.getDone()].toSorted()).toEqual(['techniques:edges', 'tutorial:overlap'])
    expect(listener).toHaveBeenCalledTimes(2)
    expect(done.getDone()).not.toBe(after)
  })

  it('loads what an earlier visit recorded', async () => {
    done.markDone('tutorial:overlap')
    vi.resetModules()
    const reloaded = await import('./done.ts')
    expect([...reloaded.getDone()]).toEqual(['tutorial:overlap'])
  })

  it('ignores a corrupt entry', async () => {
    data.set('pixel-imperium:lessons-done', '{not json')
    vi.resetModules()
    expect((await import('./done.ts')).getDone().size).toBe(0)
  })
})
