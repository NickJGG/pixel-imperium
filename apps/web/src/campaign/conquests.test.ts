import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign } from '@pixel-imperium/protocol'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'
import { markConquestsSeen, unseenConquests } from './conquests.ts'
import { campaignProgress } from './progress.ts'

const puzzle = (id: string) => ({ id, title: id, width: 5, height: 5, filledCount: 1 })
const campaign: Campaign = {
  id: 'k',
  name: 'K',
  closingLine: '',
  journey: { width: 0, height: 0, step: 0, maps: [], road: [], roadStops: [] },
  provinces: [
    { id: 'a', name: 'A', flavour: '', puzzles: [puzzle('a1')] },
    { id: 'b', name: 'B', flavour: '', puzzles: [puzzle('b1')] },
    { id: 'c', name: 'C', flavour: '', puzzles: [puzzle('c1')] },
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

  it('rebuilds the map as it was before unseen conquests', () => {
    const storage = new ProgressStorage(null)
    storage.saveSolved('a1', 'local')
    storage.saveSolved('b1', 'local')
    expect(campaignProgress(campaign, storage, [1]).provinces.map(p => p.state)).toEqual(['conquered', 'active', 'next'])
  })
})
