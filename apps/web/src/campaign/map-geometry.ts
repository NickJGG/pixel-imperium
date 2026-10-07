/**
 * Static facts about a campaign map, derived once from its regions layer: where each province's
 * label sits, its outline, and the order the conquest sweep reaches its cells.
 */
import type { CampaignMap } from '@pixel-imperium/protocol'

export interface RegionGeometry {
  /** The label's centre, in cells. */
  anchor: { x: number; y: number }
  /** An SVG path along the region's border, in cell units. */
  outline: string
}

export interface MapGeometry {
  regions: RegionGeometry[]
  /**
   * Per cell, 0 to 1: how far the sweep has to travel to reach it, outward from its region's
   * anchor, or from the map's centre for neutral terrain.
   */
  reach: number[]
  /**
   * Per cell, the opacity of the map's edge fade: 0, .25, .5, .75 or 1, over the outer `FADE`
   * cells, along a ragged line so the map bleeds into the page.
   */
  edge: number[]
}

/** How deep the edge fade reaches, in cells. */
export const FADE = 6

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const

export function mapGeometry({ width, height, regions }: CampaignMap, provinceCount: number): MapGeometry {
  const regionAt = (x: number, y: number) =>
    x < 0 || y < 0 || x >= width || y >= height ? undefined : regions[y * width + x]

  // Depth of each cell inside its region: steps to the nearest cell outside it (or the map's edge).
  const depth = new Array<number>(width * height).fill(-1)
  let frontier: number[] = []
  for (let i = 0; i < depth.length; i++) {
    const x = i % width
    const y = Math.floor(i / width)
    if (NEIGHBOURS.some(([dx, dy]) => regionAt(x + dx, y + dy) !== regions[i])) {
      depth[i] = 0
      frontier.push(i)
    }
  }
  for (let d = 1; frontier.length > 0; d++) {
    const next: number[] = []
    for (const i of frontier) {
      const x = i % width
      const y = Math.floor(i / width)
      for (const [dx, dy] of NEIGHBOURS) {
        const j = (y + dy) * width + (x + dx)
        if (regionAt(x + dx, y + dy) === regions[i] && depth[j] === -1) {
          depth[j] = d
          next.push(j)
        }
      }
    }
    frontier = next
  }

  const cellsOf = Array.from({ length: provinceCount }, () => [] as number[])
  regions.forEach((r, i) => r !== null && cellsOf[r]?.push(i))

  const reach = new Array<number>(width * height).fill(0)
  const spread = (cells: number[], cx: number, cy: number) => {
    const dist = cells.map(i => Math.hypot((i % width) + 0.5 - cx, Math.floor(i / width) + 0.5 - cy))
    const max = Math.max(1e-9, ...dist)
    cells.forEach((i, k) => (reach[i] = dist[k]! / max))
  }

  const geometry = cellsOf.map((cells): RegionGeometry => {
    if (cells.length === 0) return { anchor: { x: width / 2, y: height / 2 }, outline: '' }
    const cx = cells.reduce((s, i) => s + (i % width) + 0.5, 0) / cells.length
    const cy = cells.reduce((s, i) => s + Math.floor(i / width) + 0.5, 0) / cells.length
    // The deepest cell, nearest the centroid on ties, so a ring-shaped region labels its band, not its hole.
    let best = cells[0]!
    let bestKey = [-1, 0]
    for (const i of cells) {
      const key = [depth[i]!, -Math.hypot((i % width) + 0.5 - cx, Math.floor(i / width) + 0.5 - cy)]
      if (key[0]! > bestKey[0]! || (key[0] === bestKey[0] && key[1]! > bestKey[1]!)) {
        best = i
        bestKey = key
      }
    }
    const anchor = { x: (best % width) + 0.5, y: Math.floor(best / width) + 0.5 }
    spread(cells, anchor.x, anchor.y)

    let outline = ''
    for (const i of cells) {
      const x = i % width
      const y = Math.floor(i / width)
      const r = regions[i]
      if (regionAt(x, y - 1) !== r) outline += `M${x} ${y}h1`
      if (regionAt(x, y + 1) !== r) outline += `M${x} ${y + 1}h1`
      if (regionAt(x - 1, y) !== r) outline += `M${x} ${y}v1`
      if (regionAt(x + 1, y) !== r) outline += `M${x + 1} ${y}v1`
    }
    return { anchor, outline }
  })

  spread(
    regions.flatMap((r, i) => (r === null ? [i] : [])),
    width / 2,
    height / 2,
  )
  return { regions: geometry, reach, edge: edgeFade(width, height) }
}

/** Distance from the nearest edge, shifted by smooth value noise plus a little per-cell grain. */
function edgeFade(width: number, height: number): number[] {
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const LATTICE = 6
  const lw = Math.ceil(width / LATTICE) + 2
  const lattice = Array.from({ length: lw * (Math.ceil(height / LATTICE) + 2) }, rnd)
  const fine = Array.from({ length: width * height }, rnd)
  const at = (i: number, j: number) => lattice[j * lw + i]!
  const smooth = (t: number) => t * t * (3 - 2 * t)
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x / LATTICE)
    const iy = Math.floor(y / LATTICE)
    const fx = smooth(x / LATTICE - ix)
    const fy = smooth(y / LATTICE - iy)
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx
    return top + (bottom - top) * fy
  }

  return Array.from({ length: width * height }, (_, i) => {
    const x = i % width
    const y = Math.floor(i / width)
    const d =
      Math.min(x + 0.5, width - x - 0.5, y + 0.5, height - y - 0.5) +
      (noise(x, y) * 0.8 + fine[i]! * 0.2 - 0.5) * FADE * 0.9
    return Math.round(Math.max(0, Math.min(1, d / FADE)) * 4) / 4
  })
}
