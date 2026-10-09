import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Campaign } from '@pixel-imperium/protocol'
import { ProgressStorage } from '../play/progress-storage.ts'
import { stubStorage } from '../test-storage.ts'
import { campaignProgress, continueAt, nextPuzzle, provinceStates, techniquesRecommended } from './progress.ts'

const puzzle = (id: string) => ({ id, title: id, width: 5, height: 5, filledCount: 1 })

const campaign: Pick<Campaign, 'provinces'> = {
  provinces: [
    { id: 'a', name: 'A', theme: '', flavour: '', maxSize: 5, puzzles: [puzzle('a1'), puzzle('a2')] },
    { id: 'b', name: 'B', theme: '', flavour: '', maxSize: 5, puzzles: [puzzle('b1')] },
    { id: 'c', name: 'C', theme: '', flavour: '', maxSize: 5, puzzles: [puzzle('c1')] },
    { id: 'd', name: 'D', theme: '', flavour: '', maxSize: 5, puzzles: [puzzle('d1')] },
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
    const empty = { provinces: [{ id: 'e', name: 'E', theme: '', flavour: '', maxSize: 5, puzzles: [] }, ...campaign.provinces] }
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
