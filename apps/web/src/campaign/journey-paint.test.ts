import { describe, expect, it } from 'vitest'
import type { CampaignJourney } from '@pixel-imperium/protocol'
import { fadesOf, litUntil, paintJourney, sweepMix } from './journey-paint.ts'
import type { CampaignProgress, ProvinceState } from './progress.ts'

// Three 30×30 Maps, overlapping by 15 rows, joined by a straight Road down column 15.
const [width, height, step] = [30, 30, 15]
const ROAD_X = 15
const colours = ['#ff0000', '#00ff00', '#0000ff']
const journey: CampaignJourney = {
  width,
  height,
  step,
  maps: colours.map(c => ({ colors: new Array(width * height).fill(c), landmark: { x: ROAD_X, y: 15 } })),
  road: Array.from({ length: 2 * step + height }, (_, y) => ({ x: ROAD_X, y })),
  roadStops: [15, 30, 45],
}
const progressOf = (...states: ProvinceState[]): CampaignProgress => ({
  provinces: states.map(state => ({ state, solved: 0, total: 1 })),
  conquered: states.every(s => s === 'conquered'),
})
const rgbaAt = (px: Uint8ClampedArray, cols: number, x: number, y: number) => [...px.slice((y * cols + x) * 4, (y * cols + x) * 4 + 4)]

describe('paintJourney', () => {
  it('shows a fully opaque Map over the one above it', () => {
    const px = paintJourney(journey, progressOf('conquered', 'conquered', 'conquered'), { cols: width })
    const [above, below] = fadesOf(journey, width)
    let overlapping = 0
    for (let y = step; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (Math.abs(x - ROAD_X) <= 1 || below![(y - step) * width + x] !== 1) continue
        if (above![y * width + x]! > 0) overlapping++
        expect(rgbaAt(px, width, x, y)).toEqual([0, 255, 0, 255])
      }
    }
    expect(overlapping).toBeGreaterThan(0)
  })

  it('lights the Road exactly up to the active province', () => {
    const px = paintJourney(journey, progressOf('conquered', 'active', 'locked'), { cols: width })
    for (const { x, y } of journey.road) {
      if (journey.roadStops.some(s => Math.abs(s - y) <= 1)) continue
      expect(rgbaAt(px, width, x, y)).toEqual(y <= 30 ? [0xff, 0xd3, 0x4a, 255] : [0x9a, 0x92, 0xbd, 255])
    }
  })

  it('cuts the Journey at `rows`', () => {
    const px = paintJourney(journey, progressOf('active', 'next', 'locked'), { cols: 20, rows: 25 })
    expect(px.length).toBe(20 * 25 * 4)
  })
})

describe('conquest beats', () => {
  const before = progressOf('active', 'next', 'locked')
  const after = progressOf('conquered', 'active', 'next')
  const anim = (beats: { sweep?: number; march?: number; reveal?: number }) => ({
    from: before,
    c: 0,
    sweep: 0,
    march: 0,
    reveal: 0,
    shimmer: 0,
    ...beats,
  })

  it('marches the lit Road from one Landmark to the next', () => {
    expect(litUntil(journey, after, anim({ march: 0 }))).toBe(15)
    expect(litUntil(journey, after, anim({ march: 0.5 }))).toBe(22)
    expect(litUntil(journey, after, anim({ march: 1 }))).toBe(30)
    expect(litUntil(journey, after)).toBe(30)
  })

  it('sweeps colour out from the Landmark, finishing everywhere', () => {
    expect(sweepMix(0, 0)).toBe(0)
    expect(sweepMix(0.5, 0.3)).toBe(1)
    expect(sweepMix(0.5, 0.6)).toBe(0)
    expect(sweepMix(0.5, 0.5)).toBeCloseTo(0.5)
    expect(sweepMix(1, 1)).toBe(1)
  })

  it('paints the conquered Map grey before the sweep and in colour after it', () => {
    const at = (sweep: number) =>
      rgbaAt(paintJourney(journey, after, { cols: width, anim: anim({ sweep }) }), width, 5, 5)
    const [r, g, b] = at(0)
    expect(r).toBe(g)
    expect(g).toBe(b)
    expect(at(1).slice(0, 3)).toEqual([255, 0, 0])
  })
})
