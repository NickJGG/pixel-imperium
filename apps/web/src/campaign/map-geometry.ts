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
}

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
  return { regions: geometry, reach }
}
