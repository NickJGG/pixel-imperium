import { describe, expect, it } from 'vitest'
import type { Campaign } from '@pixel-imperium/protocol'
import { previewConquest } from './conquest-preview.ts'

const puzzle = (id: string) => ({ id, title: id, width: 2, height: 1, filledCount: 1 })
const campaign: Pick<Campaign, 'provinces'> = {
  provinces: ['a', 'b', 'c'].map(id => ({ id, name: id, theme: '', flavour: '', puzzles: [puzzle(`${id}1`)] })),
}

describe('previewConquest', () => {
  it('plays the province as the latest conquest, with stand-in Crests up to it', () => {
    const real = { title: 'a1', width: 2, height: 1, palette: ['#000', null] }
    const preview = previewConquest(campaign, 'b', [real, null, null])!
    expect(preview.conquests).toEqual([1])
    expect(preview.from[0]!.provinces.map(p => p.state)).toEqual(['conquered', 'active', 'next'])
    expect(preview.progress.provinces.map(p => p.state)).toEqual(['conquered', 'conquered', 'active'])
    expect(preview.crests[0]).toBe(real)
    expect(preview.crests[1]?.palette).toHaveLength(2)
    expect(preview.crests[2]).toBeNull()
  })

  it('is nothing for an unknown province', () => {
    expect(previewConquest(campaign, 'z', [])).toBeNull()
  })
})
