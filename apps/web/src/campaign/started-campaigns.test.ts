import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'
import { markStarted, resetStartedCache, seedStarted, startedCampaigns } from './started-campaigns.ts'

const puzzle = (id: string) => ({ id, title: id, width: 5, height: 5, filledCount: 1 })
const campaign = (id: string, puzzles: string[]) => ({
  id,
  provinces: [{ id: 'p', name: 'P', theme: '', flavour: '', paper: 'marches' as const, maxSize: 5, puzzles: puzzles.map(puzzle) }],
})

describe('started campaigns', () => {
  beforeEach(() => {
    stubStorage()
    resetStartedCache()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('remembers a campaign once marked, across reloads', () => {
    const storage = new ProgressStorage(null)
    markStarted(storage, 'c1')
    resetStartedCache()
    expect([...startedCampaigns(storage)]).toEqual(['c1'])
  })

  it('keeps accounts apart', () => {
    markStarted(new ProgressStorage('u1'), 'c1')
    expect(startedCampaigns(new ProgressStorage('u2')).size).toBe(0)
    expect(startedCampaigns(new ProgressStorage(null)).size).toBe(0)
  })

  it('seeds from a solve or saved progress, and not from nothing', () => {
    const storage = new ProgressStorage(null)
    seedStarted(campaign('none', ['a']), storage)
    storage.saveSolved('b', 'local')
    seedStarted(campaign('solved', ['b']), storage)
    storage.saveCells('c', '#..', new Date().toISOString())
    seedStarted(campaign('progress', ['c']), storage)
    expect([...startedCampaigns(storage)].sort()).toEqual(['progress', 'solved'])
  })
})
