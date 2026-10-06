/**
 * The colour each map cell shows for a player's progress: a conquered province in its art colours,
 * the active one in greyscale, locked ones under fog. Neutral terrain stays grey until the whole
 * campaign is conquered, so the ending is the first time the map is in full colour.
 */
import type { CampaignMap } from '@pixel-imperium/protocol'
import type { CampaignProgress } from './progress.ts'

export type Look = 'colour' | 'mono' | 'fog'

/** RGBA per cell, ready for `ImageData`. */
export type Pixels = Uint8ClampedArray<ArrayBuffer>

export function lookOf(region: number | null, progress: CampaignProgress): Look {
  if (region === null) return progress.conquered ? 'colour' : 'mono'
  const state = progress.provinces[region]?.state
  return state === 'conquered' ? 'colour' : state === 'active' ? 'mono' : 'fog'
}

function shade([r, g, b]: readonly number[], look: Look): [number, number, number] {
  if (look === 'colour') return [r!, g!, b!]
  const luma = 0.299 * r! + 0.587 * g! + 0.114 * b!
  if (look === 'mono') return [luma, luma, luma]
  // Dark and low-contrast, keeping just enough of the art to hint at terrain.
  return [26 + luma * 0.1, 22 + luma * 0.09, 44 + luma * 0.12]
}

const parseHex = (hex: string) => [1, 3, 5].map(k => parseInt(hex.slice(k, k + 2), 16))

export function paint(map: CampaignMap, progress: CampaignProgress): Pixels {
  const out = new Uint8ClampedArray(map.width * map.height * 4)
  map.colors.forEach((hex, i) => {
    if (hex === null) return
    out.set([...shade(parseHex(hex), lookOf(map.regions[i]!, progress)), 255], i * 4)
  })
  return out
}
