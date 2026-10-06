import { describe, expect, it } from 'vitest'
import { mapGeometry } from './map-geometry.ts'

// A 5×5 ring (region 0) around a single neutral cell, with region 1 filling the bottom row.
const rows = ['00000', '00000', '00.00', '00000', '11111']
const map = {
  width: 5,
  height: 5,
  colors: rows.join('').split('').map(() => '#000000'),
  regions: rows.join('').split('').map(c => (c === '.' ? null : Number(c))),
}

describe('mapGeometry', () => {
  const { regions, reach } = mapGeometry(map, 2)

  it('anchors a label inside its region, even when the centroid falls in a hole', () => {
    const { x, y } = regions[0]!.anchor
    expect(map.regions[Math.floor(y) * 5 + Math.floor(x)]).toBe(0)
  })

  it('outlines every border edge exactly once', () => {
    // Region 1 is a 5×1 strip: 5 top + 5 bottom + 2 ends.
    expect(regions[1]!.outline.match(/M/g)).toHaveLength(12)
  })

  it('sweeps outward from the anchor', () => {
    const { x, y } = regions[1]!.anchor
    const anchor = Math.floor(y) * 5 + Math.floor(x)
    expect(reach[anchor]).toBe(0)
    expect(Math.max(...[20, 21, 22, 23, 24].map(i => reach[i]!))).toBe(1)
  })
})
