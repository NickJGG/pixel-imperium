import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign, Province, Tier } from '@pixel-imperium/protocol'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'
import { campaignProgress, continueAt, nextPuzzle, provinceStates, shelfLayout, techniquesRecommended, tierGroups } from './progress.ts'

const puzzle = (id: string) => ({ id, title: id, width: 5, height: 5, filledCount: 1 })

const campaign: Pick<Campaign, 'provinces'> = {
  provinces: [
    { id: 'a', name: 'A', theme: '', flavour: '', paper: 'marches', maxSize: 5, puzzles: [puzzle('a1'), puzzle('a2')] },
    { id: 'b', name: 'B', theme: '', flavour: '', paper: 'marches', maxSize: 5, puzzles: [puzzle('b1')] },
    { id: 'c', name: 'C', theme: '', flavour: '', paper: 'marches', maxSize: 5, puzzles: [puzzle('c1')] },
    { id: 'd', name: 'D', theme: '', flavour: '', paper: 'marches', maxSize: 5, puzzles: [puzzle('d1')] },
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

  it('hides solves in a province not reached yet, as a Party leaves them, without unlocking it', () => {
    const { provinces } = provinceStates(campaign, id => id === 'c1')
    expect(provinces.map(p => [p.state, p.solved])).toEqual([
      ['active', 0],
      ['next', 0],
      ['locked', 0],
      ['locked', 0],
    ])
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
    const empty: Pick<Campaign, 'provinces'> = {
      provinces: [{ id: 'e', name: 'E', theme: '', flavour: '', paper: 'marches', maxSize: 5, puzzles: [] }, ...campaign.provinces],
    }
    const { provinces, conquered } = provinceStates(empty, () => true)
    expect(provinces.map(p => p.state)).toEqual(['active', 'next', 'locked', 'locked', 'locked'])
    expect(conquered).toBe(false)
  })

  it('leaves taken-down puzzles out of the count, so they never hold a province back', () => {
    const removed: Pick<Campaign, 'provinces'> = {
      provinces: [{ ...campaign.provinces[0]!, puzzles: [puzzle('a1'), { ...puzzle('a2'), removed: true }] }],
    }
    expect(provinceStates(removed, id => id === 'a1').provinces[0]).toEqual({ state: 'conquered', solved: 1, total: 1 })
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

describe('nextPuzzle', () => {
  const puzzles = ['p1', 'p2', 'p3', 'p4'].map(puzzle)
  const next = (current: string, solved: string[]) => nextPuzzle(puzzles, current, id => solved.includes(id))?.id

  it('offers the following puzzle', () => {
    expect(next('p1', ['p1'])).toBe('p2')
  })

  it('skips solved puzzles and wraps around', () => {
    expect(next('p2', ['p2', 'p3'])).toBe('p4')
    expect(next('p3', ['p2', 'p3', 'p4'])).toBe('p1')
  })

  it('skips taken-down puzzles', () => {
    const gappy = [puzzle('p1'), { ...puzzle('p2'), removed: true as const }, puzzle('p3')]
    expect(nextPuzzle(gappy, 'p1', id => id === 'p1')?.id).toBe('p3')
    expect(nextPuzzle(gappy, 'p1', () => true)?.id).toBe('p3')
  })

  it('offers the following puzzle once everything is solved, and none after the last', () => {
    const all = ['p1', 'p2', 'p3', 'p4']
    expect(next('p2', all)).toBe('p3')
    expect(next('p4', all)).toBeUndefined()
  })
})

describe('continueAt', () => {
  const at = (solved: string[], opts?: { unlockAll?: boolean }) => {
    const isSolved = (id: string) => solved.includes(id)
    const target = continueAt(campaign, provinceStates(campaign, isSolved, opts), isSolved)
    return target && { puzzle: target.puzzle.id, number: target.number, fresh: target.fresh }
  }

  it('starts a new player on the first puzzle', () => {
    expect(at([])).toEqual({ puzzle: 'a1', number: 1, fresh: true })
  })

  it('picks the lowest unsolved puzzle in the active province', () => {
    expect(at(['a2'])).toEqual({ puzzle: 'a1', number: 1, fresh: false })
    expect(at(['a1', 'a2'])).toEqual({ puzzle: 'b1', number: 1, fresh: false })
  })

  it('takes the first open province when unlocking all', () => {
    expect(at(['a1', 'a2', 'c1'], { unlockAll: true })?.puzzle).toBe('b1')
  })

  it('has nowhere to go once the campaign is conquered', () => {
    expect(at(['a1', 'a2', 'b1', 'c1', 'd1'])).toBeNull()
  })
})

describe('techniquesRecommended', () => {
  const flagged = { provinces: campaign.provinces.map(p => (p.id === 'b' ? { ...p, techniques: true as const } : p)) }
  const recommended = (solved: string[]) => techniquesRecommended(flagged, provinceStates(flagged, id => solved.includes(id)))

  it('recommends them once the flagged province starts', () => {
    expect(recommended(['a1'])).toBe(false)
    expect(recommended(['a1', 'a2'])).toBe(true)
    expect(recommended(['a1', 'a2', 'b1'])).toBe(true)
  })

  it('never recommends them with no flagged province', () => {
    expect(techniquesRecommended(campaign, provinceStates(campaign, () => true))).toBe(false)
  })
})

describe('shelfLayout', () => {
  it('lays out an official province as its tiers need, 4 deep', () => {
    expect(shelfLayout([11, 16, 3])).toEqual({ rows: 4, columns: [3, 4, 1] })
    expect(shelfLayout([6, 15, 9])).toEqual({ rows: 4, columns: [2, 4, 3] })
  })

  it('pads a small province’s last shelf out to an official one’s width, so its slots stand the same size', () => {
    expect(shelfLayout([1])).toEqual({ rows: 4, columns: [8] })
    expect(shelfLayout([3, 3, 3])).toEqual({ rows: 4, columns: [1, 1, 6] })
    expect(shelfLayout([])).toEqual({ rows: 4, columns: [] })
  })
})

describe('tierGroups', () => {
  const tiered = (id: string, tier?: Tier) => ({ ...puzzle(id), ...(tier ? { tier } : {}) })
  const numbers = (province: Pick<Province, 'puzzles'>) =>
    tierGroups(province).map(g => [g.tier, g.slots.map(s => s.number)])

  it('groups the slots by tier, easiest first, keeping their numbers', () => {
    const puzzles = [tiered('a', 'easy'), tiered('b', 'easy'), tiered('c', 'medium'), tiered('d', 'hard'), tiered('e', 'hard')]
    expect(numbers({ puzzles })).toEqual([
      ['easy', [1, 2]],
      ['medium', [3]],
      ['hard', [4, 5]],
    ])
  })

  it('counts untiered puzzles as easy and leaves out empty tiers', () => {
    expect(numbers({ puzzles: [tiered('a'), tiered('b', 'hard'), tiered('c')] })).toEqual([
      ['easy', [1, 3]],
      ['hard', [2]],
    ])
  })

  it('has no groups for an empty province', () => {
    expect(tierGroups({ puzzles: [] })).toEqual([])
  })
})
