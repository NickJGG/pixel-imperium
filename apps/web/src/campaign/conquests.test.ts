import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign } from '@pixel-imperium/protocol'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'
import { isConquestSeen, markConquestsSeen, unseenConquests } from './conquests.ts'
import { campaignProgress } from './progress.ts'

const puzzle = (id: string) => ({ id, title: id, width: 5, height: 5, filledCount: 1 })
const campaign: Campaign = {
  id: 'k',
  name: 'K',
  closingLine: '',
  journey: { width: 0, height: 0, step: 0, maps: [], road: [], roadStops: [] },
  provinces: [
    { id: 'a', name: 'A', theme: '', flavour: '', puzzles: [puzzle('a1')] },
    { id: 'b', name: 'B', theme: '', flavour: '', puzzles: [puzzle('b1')] },
    { id: 'c', name: 'C', theme: '', flavour: '', puzzles: [puzzle('c1')] },
  ],
}

describe('conquests', () => {
  beforeEach(() => stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('reports each conquest until it has been seen', () => {
    const storage = new ProgressStorage(null)
    storage.saveSolved('a1', 'local')
    expect(unseenConquests(campaign, campaignProgress(campaign, storage), storage)).toEqual([0])
    markConquestsSeen(campaign, [0], storage)
    storage.saveSolved('b1', 'local')
    expect(unseenConquests(campaign, campaignProgress(campaign, storage), storage)).toEqual([1])
  })

  it('tells whether one conquest has been seen', () => {
    const storage = new ProgressStorage(null)
    expect(isConquestSeen(campaign, 0, storage)).toBe(false)
    markConquestsSeen(campaign, [0], storage)
    expect(isConquestSeen(campaign, 0, storage)).toBe(true)
    expect(isConquestSeen(campaign, 1, storage)).toBe(false)
  })

  it('rebuilds the map as it was before unseen conquests', () => {
    const storage = new ProgressStorage(null)
    storage.saveSolved('a1', 'local')
    storage.saveSolved('b1', 'local')
    expect(campaignProgress(campaign, storage, [1]).provinces.map(p => p.state)).toEqual(['conquered', 'active', 'next'])
  })
})
