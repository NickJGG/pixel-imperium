/** Static facts about one province Map: its ragged edge fade and how far the conquest sweep has to travel. */

/** How deep the edge fade reaches, in cells. */
export const FADE = 6

/**
 * Per cell, the opacity of the Map's edge fade: 0, .25, .5, .75 or 1, over the outer `FADE` cells,
 * along a ragged line so the Map bleeds into the page. Distance from the nearest edge, shifted by
 * smooth value noise plus a little per-cell grain; `seed` gives each Map its own ragged line.
 */
export function edgeFade(width: number, height: number, seed: number): number[] {
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

/**
 * The Map's fade when only the middle `cols` columns are shown: the full fade, faded again at the
 * crop window's own edges, and 0 outside it. Still `width` × `height`.
 */
export function mapFade(width: number, height: number, cols: number, seed: number): number[] {
  const full = edgeFade(width, height, seed)
  if (cols >= width) return full
  const x0 = Math.floor((width - cols) / 2)
  const crop = edgeFade(cols, height, seed + 1000)
  return full.map((a, i) => {
    const cx = (i % width) - x0
    return cx < 0 || cx >= cols ? 0 : Math.min(a, crop[Math.floor(i / width) * cols + cx]!)
  })
}

/**
 * Per cell, 0 to 1: how far the conquest sweep has to travel to reach it from the Landmark.
 * Squashed horizontally, as a Map is much wider than it is tall.
 */
export function reachFrom(width: number, height: number, landmark: { x: number; y: number }): number[] {
  const dist = Array.from({ length: width * height }, (_, i) =>
    Math.hypot(((i % width) - landmark.x) / 1.6, Math.floor(i / width) - landmark.y),
  )
  const max = Math.max(1e-9, ...dist)
  return dist.map(d => d / max)
}
