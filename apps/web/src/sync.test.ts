import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MyProgress, SavedProgress } from '@pixel-imperium/protocol'
import { ProgressStorage } from './play/progress-storage.ts'
import { ProgressSync, SYNC_DELAY_MS, type SyncApi } from './sync.ts'
import { stubStorage } from './test-storage.ts'

function fakeApi(progress: MyProgress = { puzzles: {}, assists: null, showcase: [], tutorialAskedAt: null }) {
  return {
    fetchProgress: vi.fn<SyncApi['fetchProgress']>(async () => progress),
    putProgress: vi.fn<SyncApi['putProgress']>(async () => ({ applied: true })),
    solve: vi.fn<SyncApi['solve']>(async () => ({ solved: true, palette: ['#f00', null], foil: true })),
  }
}

describe('ProgressSync', () => {
  let storage: ProgressStorage
  beforeEach(() => {
    stubStorage()
    vi.useFakeTimers()
    storage = new ProgressStorage('u1')
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  const edit = (sync: ProgressSync, id: string, cells: string, at: string) => {
    storage.saveCells(id, cells, at)
    sync.markDirty(id)
  }

  it('sends the latest grid once play pauses', async () => {
    const api = fakeApi()
    const sync = new ProgressSync(storage, api)
    edit(sync, 'a', '#.', '2026-01-01T00:00:00.000Z')
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS - 1)
    edit(sync, 'a', '##', '2026-01-01T00:00:01.000Z')
    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS - 1)
    expect(api.putProgress).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(1)
    expect(api.putProgress).toHaveBeenCalledExactlyOnceWith(
      'a',
      { cells: '##', replaying: false, updatedAt: '2026-01-01T00:00:01.000Z' } satisfies SavedProgress,
      false,
    )
    expect(storage.loadMeta('dirty')).toBeNull()
  })

  it('flushes at once with keepalive when the page is leaving', async () => {
    const api = fakeApi()
    const sync = new ProgressSync(storage, api)
    edit(sync, 'a', '#.', '2026-01-01T00:00:00.000Z')
    storage.saveReplay('a')
    expect(await sync.flush({ keepalive: true })).toBe(true)
    expect(api.putProgress).toHaveBeenCalledWith('a', expect.objectContaining({ replaying: true }), true)

    await vi.advanceTimersByTimeAsync(SYNC_DELAY_MS)
    expect(api.putProgress).toHaveBeenCalledTimes(1)
  })

  it('keeps unsent grids dirty across reloads until they go through', async () => {
    const offline = fakeApi()
    offline.putProgress.mockRejectedValue(new TypeError('Failed to fetch'))
    const first = new ProgressSync(storage, offline)
    edit(first, 'a', '#.', '2026-01-01T00:00:00.000Z')
    expect(await first.flush()).toBe(false)

    const online = fakeApi()
    expect(await new ProgressSync(storage, online).flush()).toBe(true)
    expect(online.putProgress).toHaveBeenCalledWith('a', expect.objectContaining({ cells: '#.' }), false)
    expect(storage.loadMeta('dirty')).toBeNull()
  })

  it('keeps a puzzle dirty when it changes while its grid is being sent', async () => {
    const api = fakeApi()
    const sync = new ProgressSync(storage, api)
    api.putProgress.mockImplementationOnce(async () => {
      storage.saveCells('a', '##', '2026-01-01T00:00:01.000Z')
      return { applied: true }
    })
    edit(sync, 'a', '#.', '2026-01-01T00:00:00.000Z')
    await sync.flush()
    expect(storage.loadMeta('dirty')).toBe('["a"]')
  })

  it('pull replaces the cache with the account data', async () => {
    const api = fakeApi({
      puzzles: {
        b: {
          solved: 'verified',
          progress: { cells: '#x', replaying: true, updatedAt: '2026-01-02T00:00:00.000Z' },
          palette: ['#f00', null],
          foil: true,
          hinted: false,
        },
        c: { solved: 'unverified', progress: null, palette: null, foil: false, hinted: true },
      },
      assists: null,
      showcase: ['b'],
      tutorialAskedAt: null,
    })
    storage.saveCells('stale', '#', '2026-01-01T00:00:00.000Z')
    const data = await new ProgressSync(storage, api).pull()

    expect(data?.puzzles).toHaveProperty('b')
    expect(storage.puzzleIds().sort()).toEqual(['b', 'c'])
    expect(storage.loadCells('b')).toBe('#x')
    expect(storage.loadUpdatedAt('b')).toBe('2026-01-02T00:00:00.000Z')
    expect(storage.loadReplay('b')).toBe(true)
    expect(storage.loadSolved('b')).toBe('verified')
    expect(storage.loadPalette('b', 2)).toEqual(['#f00', null])
    expect(storage.loadSolved('c')).toBe('unverified')
    expect([storage.loadFoil('b'), storage.loadHinted('b')]).toEqual([true, false])
    expect([storage.loadFoil('c'), storage.loadHinted('c')]).toEqual([false, true])
    expect(storage.loadShowcase()).toEqual(['b'])
  })

  it('pull sends local changes first and keeps the cache when offline', async () => {
    const api = fakeApi()
    api.putProgress.mockRejectedValue(new TypeError('Failed to fetch'))
    const sync = new ProgressSync(storage, api)
    edit(sync, 'a', '#.', '2026-01-01T00:00:00.000Z')
    expect(await sync.pull()).toBeNull()
    expect(api.fetchProgress).not.toHaveBeenCalled()
    expect(storage.loadCells('a')).toBe('#.')

    api.putProgress.mockResolvedValue({ applied: true })
    api.fetchProgress.mockRejectedValue(new TypeError('Failed to fetch'))
    expect(await sync.pull()).toBeNull()
    expect(storage.loadCells('a')).toBe('#.')
  })

  it('re-submits solves made offline so they become verified', async () => {
    const api = fakeApi()
    storage.saveCells('a', '#x', '2026-01-01T00:00:00.000Z')
    storage.saveSolved('a', 'local')
    storage.saveSolved('b', 'unverified')
    await new ProgressSync(storage, api).reconnect()

    expect(api.solve).toHaveBeenCalledExactlyOnceWith('a', { cells: ['filled', 'empty'] })
    expect(storage.loadSolved('a')).toBe('verified')
    expect(storage.loadPalette('a', 2)).toEqual(['#f00', null])
    expect(storage.loadFoil('a')).toBe(true)
    expect(storage.loadSolved('b')).toBe('unverified')
  })
})
