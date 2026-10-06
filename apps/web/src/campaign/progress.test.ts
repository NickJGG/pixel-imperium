import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign } from '@pixel-imperium/protocol'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'
import { campaignProgress, provinceStates } from './progress.ts'

const puzzle = (id: string) => ({ id, title: id, width: 5, height: 5, filledCount: 1 })

const campaign: Pick<Campaign, 'provinces'> = {
  provinces: [
    { id: 'a', name: 'A', flavour: '', puzzles: [puzzle('a1'), puzzle('a2')] },
    { id: 'b', name: 'B', flavour: '', puzzles: [puzzle('b1')] },
    { id: 'c', name: 'C', flavour: '', puzzles: [puzzle('c1')] },
    { id: 'd', name: 'D', flavour: '', puzzles: [puzzle('d1')] },
  ],
}

const statesOf = (solved: string[], opts?: { unlockAll?: boolean }) =>
  provinceStates(campaign, id => solved.includes(id), opts).provinces.map(p => p.state)

describe('provinceStates', () => {
  it('starts with the first province active and the second next', () => {
    expect(statesOf([])).toEqual(['active', 'next', 'locked', 'locked'])
  })

  it('counts solves per province', () => {
    expect(provinceStates(campaign, id => id === 'a1').provinces[0]).toEqual({ state: 'active', solved: 1, total: 2 })
  })

  it('conquers a province once every puzzle is solved, unlocking the next', () => {
    expect(statesOf(['a1', 'a2'])).toEqual(['conquered', 'active', 'next', 'locked'])
    expect(statesOf(['a1', 'a2', 'b1', 'c1'])).toEqual(['conquered', 'conquered', 'conquered', 'active'])
  })

  it('does not conquer past an unconquered province', () => {
    expect(statesOf(['a1', 'b1', 'c1'])).toEqual(['active', 'next', 'locked', 'locked'])
  })

  it('conquers the campaign with its last province', () => {
    const all = ['a1', 'a2', 'b1', 'c1', 'd1']
    expect(provinceStates(campaign, id => all.includes(id)).conquered).toBe(true)
    expect(provinceStates(campaign, id => all.slice(1).includes(id)).conquered).toBe(false)
  })

  it('never conquers an empty province', () => {
    const empty = { provinces: [{ id: 'e', name: 'E', flavour: '', puzzles: [] }, ...campaign.provinces] }
    const { provinces, conquered } = provinceStates(empty, () => true)
    expect(provinces.map(p => p.state)).toEqual(['active', 'next', 'locked', 'locked', 'locked'])
    expect(conquered).toBe(false)
  })

  it('opens every unconquered province when unlocking all', () => {
    expect(statesOf(['b1'], { unlockAll: true })).toEqual(['active', 'conquered', 'active', 'active'])
  })
})

describe('campaignProgress', () => {
  beforeEach(() => stubStorage())
  afterEach(() => vi.unstubAllGlobals())

  it('counts every kind of solve', () => {
    const storage = new ProgressStorage('u1')
    storage.saveSolved('a1', 'local')
    storage.saveSolved('a2', 'unverified')
    storage.saveSolved('b1', 'verified')
    expect(campaignProgress(campaign, storage).provinces.map(p => p.state)).toEqual([
      'conquered',
      'conquered',
      'active',
      'next',
    ])
  })
})
