/**
 * The Journey's pixels for a player's progress: a conquered province's Map in its art colours, the
 * active one in greyscale, the rest under fog, each faded at its edges and laid over the Map above
 * it. The Road runs on top, lit up to the furthest province reached, with a marker at each Landmark.
 *
 * A conquest plays in beats, each running 0 → 1: its Map sweeps into colour outward from its
 * Landmark, the Road marches on to the next Landmark, the next Map comes out of the fog, and once
 * the last province falls a bright band shimmers down the whole Road.
 */
import type { CampaignJourney } from '@pixel-imperium/protocol'
import { mapFade, reachFrom } from './map-geometry.ts'
import type { CampaignProgress, ProvinceState } from './progress.ts'

export type Look = 'colour' | 'mono' | 'fog'

/** RGBA per cell, ready for `ImageData`. */
export type Pixels = Uint8ClampedArray<ArrayBuffer>

export const lookOf = (state: ProvinceState): Look =>
  state === 'conquered' ? 'colour' : state === 'active' ? 'mono' : 'fog'

export function shade([r, g, b]: readonly number[], look: Look): [number, number, number] {
  if (look === 'colour') return [r!, g!, b!]
  const luma = 0.299 * r! + 0.587 * g! + 0.114 * b!
  if (look === 'mono') return [luma, luma, luma]
  // Dark and low-contrast, keeping just enough of the art to hint at terrain.
  return [26 + luma * 0.1, 22 + luma * 0.09, 44 + luma * 0.12]
}

export const parseHex = (hex: string) => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16))

export const journeyHeight = ({ height, step, maps }: CampaignJourney) => (maps.length - 1) * step + height

/** The first column shown when only the middle `cols` are. */
export const cropStart = (journey: CampaignJourney, cols: number) => Math.floor((journey.width - cols) / 2)

const fadeCache = new WeakMap<CampaignJourney, Map<number, number[][]>>()

/** Each Map's fade for a `cols`-wide window, by province index; memoised per journey. */
export function fadesOf(journey: CampaignJourney, cols: number): number[][] {
  let byCols = fadeCache.get(journey)
  if (!byCols) fadeCache.set(journey, (byCols = new Map()))
  let fades = byCols.get(cols)
  if (!fades) {
    fades = journey.maps.map((_, i) => mapFade(journey.width, journey.height, cols, 11 + i * 7))
    byCols.set(cols, fades)
  }
  return fades
}

const reachCache = new WeakMap<CampaignJourney, number[][]>()

function reachesOf(journey: CampaignJourney): number[][] {
  let reaches = reachCache.get(journey)
  if (!reaches) {
    reaches = journey.maps.map(({ landmark }) => reachFrom(journey.width, journey.height, landmark))
    reachCache.set(journey, reaches)
  }
  return reaches
}

/** Conquest of province `c` mid-play; `from` is the Journey before it. */
export interface ConquestAnim {
  from: CampaignProgress
  c: number
  sweep: number
  march: number
  reveal: number
  shimmer: number
}

/**
 * How far the sweep has turned a cell `reach` from the Landmark to colour, 0 to 1, over a 0.2
 * band: (sweep × 1.2 − reach) / 0.2, written so the far edge lands on exactly 1.
 */
export const sweepMix = (sweep: number, reach: number) => Math.max(0, Math.min(1, sweep * 6 - reach * 5))

const reachedStop = ({ roadStops }: CampaignJourney, progress: CampaignProgress) =>
  roadStops[Math.max(0, progress.provinces.findLastIndex(p => p.state === 'active' || p.state === 'conquered'))]!

/** The last lit Road index: at the furthest province reached, or on its way there while marching. */
export function litUntil(journey: CampaignJourney, progress: CampaignProgress, anim?: ConquestAnim): number {
  const to = reachedStop(journey, progress)
  if (!anim) return to
  const from = reachedStop(journey, anim.from)
  return Math.floor(from + (to - from) * anim.march)
}

const ROAD = { core: '#ffd34a', edge: '#6b4226', dimCore: '#9a92bd', dimEdge: '#4a4170' }
const MARKER = { conquered: '#ffd34a', active: '#ff4fa3', other: '#9a92bd', corner: '#1a0614' }
const SHIMMER = { head: '#fffbe6', trail: '#ffe680', headLength: 3, trailLength: 8 }

/**
 * `cols` wide (the middle of the journey) and `rows` tall, from the top; `rows` cuts the Journey
 * short, for a Profile. With `anim`, `progress` is the Journey once that conquest has played.
 */
export function paintJourney(
  journey: CampaignJourney,
  progress: CampaignProgress,
  { cols, rows = journeyHeight(journey), anim }: { cols: number; rows?: number; anim?: ConquestAnim | undefined },
): Pixels {
  const { width, height, step, maps, road } = journey
  const x0 = cropStart(journey, cols)
  const fades = fadesOf(journey, cols)
  // Straight alpha, 0–1, so each Map composites over the ones above it.
  const buf = new Float32Array(cols * rows * 4)

  maps.forEach(({ colors }, i) => {
    const look = lookOf(progress.provinces[i]!.state)
    const fade = fades[i]!
    const reach = reachesOf(journey)[i]!
    // How far each cell has come from its look before the conquest.
    const mix = !anim
      ? null
      : i === anim.c
        ? (src: number) => sweepMix(anim.sweep, reach[src]!)
        : i === anim.c + 1
          ? () => anim.reveal
          : null
    const before = anim && lookOf(anim.from.provinces[i]!.state)
    for (let y = 0; y < height && i * step + y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const src = y * width + x + x0
        const hex = colors[src]
        const a = fade[src]!
        if (!hex || a === 0) continue
        const rgb = parseHex(hex)
        let c = shade(rgb, look)
        const t = mix?.(src) ?? 1
        if (t < 1) {
          const b = shade(rgb, before!)
          c = [b[0] + (c[0] - b[0]) * t, b[1] + (c[1] - b[1]) * t, b[2] + (c[2] - b[2]) * t]
        }
        const o = ((i * step + y) * cols + x) * 4
        const under = buf[o + 3]! * (1 - a)
        const out = a + under
        for (let k = 0; k < 3; k++) buf[o + k] = (c[k]! * a + buf[o + k]! * under) / out
        buf[o + 3] = out
      }
    }
  })

  const put = (x: number, y: number, hex: string) => {
    x -= x0
    if (x < 0 || y < 0 || x >= cols || y >= rows) return
    buf.set([...parseHex(hex), 1], (y * cols + x) * 4)
  }

  const lit = litUntil(journey, progress, anim)
  for (const [k, { x, y }] of road.entries()) {
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const)
      put(x + dx, y + dy, k <= lit ? ROAD.edge : ROAD.dimEdge)
  }
  const { headLength, trailLength } = SHIMMER
  const head = anim?.shimmer ? anim.shimmer * (road.length + headLength + trailLength) : -Infinity
  for (const [k, { x, y }] of road.entries()) {
    const behind = head - k
    const core = k <= lit ? ROAD.core : ROAD.dimCore
    put(x, y, behind < 0 ? core : behind < headLength ? SHIMMER.head : behind < headLength + trailLength ? SHIMMER.trail : core)
  }

  maps.forEach(({ landmark }, i) => {
    const settled = !anim || (i === anim.c ? anim.sweep >= 1 : i !== anim.c + 1 || anim.reveal >= 1)
    const state = (settled ? progress : anim.from).provinces[i]!.state
    const c = state === 'conquered' ? MARKER.conquered : state === 'active' ? MARKER.active : MARKER.other
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        put(landmark.x + dx, i * step + landmark.y + dy, dx !== 0 && dy !== 0 ? MARKER.corner : c)
  })

  const out = new Uint8ClampedArray(buf.length)
  buf.forEach((v, i) => (out[i] = i % 4 === 3 ? v * 255 : v))
  return out
}

/** One province's Map on its own, for its page's header: its own fade, no Road. */
export function paintMap(journey: CampaignJourney, i: number, look: Look, cols: number): Pixels {
  const { width, height } = journey
  const x0 = cropStart(journey, cols)
  const fade = fadesOf(journey, cols)[i]!
  const out = new Uint8ClampedArray(cols * height * 4)
  journey.maps[i]!.colors.forEach((hex, src) => {
    const x = (src % width) - x0
    if (!hex || x < 0 || x >= cols) return
    out.set([...shade(parseHex(hex), look), fade[src]! * 255], (Math.floor(src / width) * cols + x) * 4)
  })
  return out
}
