import { describe, expect, it } from 'vitest'
import type { Campaign } from '@pixel-imperium/protocol'
import { crestPixels, landing } from './crest.ts'

const puzzle = (id: string, crest: number) => ({ id, title: id, width: 5, height: 5, filledCount: 1, crest })

const campaign: Pick<Campaign, 'crest' | 'provinces'> = {
  crest: { width: 2, height: 2 },
  provinces: [
    { id: 'a', name: 'A', theme: '', flavour: '', paper: 'marches', maxSize: 5, puzzles: [puzzle('a1', 3), puzzle('a2', 0)] },
    { id: 'b', name: 'B', theme: '', flavour: '', paper: 'marches', maxSize: 5, puzzles: [puzzle('b1', 1), puzzle('b2', 2)] },
  ],
}

const storage = (solved: Record<string, string | null>) => ({
  loadSolved: (id: string) => (id in solved ? ('local' as const) : null),
  loadCrest: (id: string) => solved[id] ?? null,
})

describe('crestPixels', () => {
  it('colors each solved puzzle’s own pixel', () => {
    expect(crestPixels(campaign, storage({ a1: '#111111', b1: '#222222' }))).toEqual([
      null,
      '#222222',
      null,
      '#111111',
    ])
  })

  it('leaves a solve blank until its color has come back', () => {
    expect(crestPixels(campaign, storage({ a2: null }))).toEqual([null, null, null, null])
  })

  it('ignores a color kept for an unsolved puzzle', () => {
    expect(crestPixels(campaign, { loadSolved: () => null, loadCrest: () => '#111111' })).toEqual([null, null, null, null])
  })

  it('is null without a Crest', () => {
    expect(crestPixels({ provinces: campaign.provinces }, storage({}))).toBeNull()
  })
})

describe('landing', () => {
  const pixels = ['#111111', null, null]

  it('lands where the sticker hovered once that pixel is revealed', () => {
    expect(landing(0, 1, pixels)).toBe(0)
    expect(landing(0, null, pixels)).toBe(0)
  })

  it('stays put while the sticker hasn’t moved or its pixel is still blank', () => {
    expect(landing(1, 1, pixels)).toBeNull()
    expect(landing(2, 1, pixels)).toBeNull()
    expect(landing(null, 1, pixels)).toBeNull()
  })
})
