/**
 * Generates `data/campaigns/imperium/map.json`: a 120×80 landscape whose provinces chain
 * Marches → Coast → Wildwood → Forge → Capital → Throne, each bordering the next, inside a neutral
 * margin that the client fades into the page. Deterministic, so a rerun rewrites the same file.
 *
 * Steps: a seeded value-noise layout assigns every cell a terrain (the margin continues the
 * landscape and the sea), each terrain has its own filler, then roads, the river, the harbour and the
 * palace are stamped on top. Self-checks throw if the layout breaks the campaign's rules.
 */
import { writeFileSync } from 'node:fs'
import type { MapDef } from './campaigns.ts'

const W = 120
const H = 80
const MARGIN = 9
const OUT = new URL('../data/campaigns/imperium/map.json', import.meta.url)

const PALETTE: Record<string, string> = {
  '0': '#8a5a34', '1': '#b0841a', '2': '#6c3fa2', '3': '#4a2878', '4': '#2a1f3d',
  a: '#3f7432', b: '#9a6a42', c: '#a5cd62', d: '#8bb64f', e: '#e2c35c', f: '#7db14a', g: '#ead89d',
  h: '#e0f3fb', i: '#62b8d8', j: '#2f86c0', k: '#22689f', l: '#2a5f94', m: '#17436f', n: '#c8a643',
  o: '#7f5534', p: '#5f973b', q: '#c9a678', r: '#d3bc7b', s: '#b5443a', t: '#efe0c0', u: '#4a8fd1',
  v: '#7ab8e9', w: '#1d4a2a', x: '#2c6935', y: '#3f8a3e', z: '#143521', A: '#5ba64b', B: '#f7f3e8',
  C: '#6b4226', D: '#aaa4a1', E: '#585250', F: '#8c8a6e', G: '#f3f5f8', H: '#aca290', I: '#c6d2e0',
  J: '#3a3536', K: '#7e7774', L: '#8f8676', M: '#625b4f', N: '#cfc5b2', O: '#d49c46', P: '#c1583f',
  Q: '#444f66', R: '#a8762f', S: '#94402f', T: '#f08a24', U: '#ffd34a', V: '#5f6d88', W: '#6aa34a',
  X: '#e9ba24', Y: '#f3eee4', Z: '#c42f3c',
}

const PROVINCES = [
  { key: 'm', id: 'marches', target: 1600 },
  { key: 'c', id: 'coast', target: 1100 },
  { key: 'w', id: 'wildwood', target: 1100 },
  { key: 'f', id: 'forge', target: 1000 },
  { key: 'k', id: 'capital', target: 650 },
  { key: 't', id: 'throne', target: 250 },
] as const
type Key = (typeof PROVINCES)[number]['key']
/** A province's terrain, or open sea. */
type Terrain = Key | 's'

let seed = 20261007
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

/** Smooth value noise in [0, 1] with a lattice every `cell` cells. */
function noise(cell: number) {
  const lw = Math.ceil(W / cell) + 2
  const lattice = Array.from({ length: lw * (Math.ceil(H / cell) + 2) }, rnd)
  const at = (i: number, j: number) => lattice[clamp(j, 0, 1e9) * lw + clamp(i, 0, lw - 1)]!
  const smooth = (t: number) => t * t * (3 - 2 * t)
  return (x: number, y: number) => {
    const ix = Math.floor(x / cell)
    const iy = Math.floor(y / cell)
    const fx = smooth(x / cell - ix)
    const fy = smooth(y / cell - iy)
    const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * fx
    const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * fx
    return top + (bottom - top) * fy
  }
}

const idx = (x: number, y: number) => y * W + x
const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H
const interior = (x: number, y: number) => x >= MARGIN && y >= MARGIN && x < W - MARGIN && y < H - MARGIN

// ---- Layout ----

const nShore = noise(7)
const nSea = noise(9)
const nWest = noise(8)
const nSouth = noise(8)
const nRidge = noise(4)

/** The valley's centre; the capital's walls and the forge's crescent are ellipses around it. */
const CX = 50
const CY = 40
const STRETCH = 1.25
const CITY_R = 15.3
const PALACE = { x0: CX - 11, x1: CX + 11, y0: CY - 6, y1: CY + 5 }

const shoreX = (y: number) => 92 + 4 * nShore(0, y)
const coastLandX = (y: number) => shoreX(y) - 7 - 2 * nShore(60, y)
const seaEdgeX = (y: number) => 103 + 4 * nSea(0, y)
const westX = (y: number) => 25 + 5 * nWest(0, y)
const southY = (x: number) => 55 + 3 * nSouth(x, 0)

const polar = (x: number, y: number) => {
  const dx = (x + 0.5 - CX) / STRETCH
  const dy = y + 0.5 - CY
  return { r: Math.hypot(dx, dy), south: dy / Math.max(1e-9, Math.hypot(dx, dy)) }
}

function terrainAt(x: number, y: number): Terrain {
  if (x >= PALACE.x0 && x < PALACE.x1 && y >= PALACE.y0 && y <= PALACE.y1) return 't'
  const { r, south } = polar(x, y)
  if (r < CITY_R) return 'k'
  // The crescent thins to nothing on the valley's south side, where the city meets the forest.
  const ridge = clamp((0.8 - south) / 0.45)
  if (r < CITY_R + ridge * (8 + 3 * nRidge(x, y))) return 'f'
  if (x >= seaEdgeX(y)) return 's'
  if (x >= coastLandX(y)) return 'c'
  if (x < westX(y) || y > southY(x)) return 'm'
  return 'w'
}

const terrain: Terrain[] = Array.from({ length: W * H }, (_, i) => terrainAt(i % W, Math.floor(i / W)))

/** 4-connected components of the cells `inside` accepts. */
function components(inside: (i: number) => boolean): number[][] {
  const seen = new Uint8Array(W * H)
  const out: number[][] = []
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || !inside(i)) continue
    const comp = [i]
    seen[i] = 1
    for (let k = 0; k < comp.length; k++) {
      const x = comp[k]! % W
      const y = Math.floor(comp[k]! / W)
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]] as const) {
        const j = idx(nx, ny)
        if (inGrid(nx, ny) && !seen[j] && inside(j)) {
          seen[j] = 1
          comp.push(j)
        }
      }
    }
    out.push(comp)
  }
  return out
}

// Noise can strand a few cells of a province; hand them to whatever surrounds them.
for (const { key } of PROVINCES) {
  const comps = components(i => terrain[i] === key && interior(i % W, Math.floor(i / W)))
  comps.sort((a, b) => b.length - a.length)
  for (const stray of comps.slice(1)) {
    const around = new Map<Terrain, number>()
    for (const i of stray) {
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        const t = terrain[j]
        if (t !== undefined && t !== key) around.set(t, (around.get(t) ?? 0) + 1)
      }
    }
    const into = [...around].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'w'
    for (const i of stray) terrain[i] = into
  }
}

// ---- Terrain fillers ----

const art: string[] = new Array(W * H).fill('.')
const fine = Array.from({ length: W * H }, rnd)
const isT = (x: number, y: number, t: Terrain) => inGrid(x, y) && terrain[idx(x, y)] === t
const set = (x: number, y: number, ch: string, only?: Terrain) => {
  if (inGrid(x, y) && (!only || terrain[idx(x, y)] === only)) art[idx(x, y)] = ch
}

/** Hedged plots in bands, each band split at its own columns so the patchwork never lines up. */
function fillFields() {
  const kinds = ['wheat', 'wheat', 'crops', 'crops', 'plough', 'pasture', 'pasture', 'village'] as const
  for (let y0 = 0; y0 < H; ) {
    const bh = 4 + Math.floor(rnd() * 4)
    for (let x0 = -Math.floor(rnd() * 6); x0 < W; ) {
      const bw = 5 + Math.floor(rnd() * 6)
      const kind = pick(kinds)
      for (let y = y0; y < y0 + bh; y++) {
        for (let x = Math.max(0, x0); x < x0 + bw; x++) {
          if (!isT(x, y, 'm')) continue
          const u = x - x0
          const v = y - y0
          let ch: string
          if (v === 0 || u === 0) ch = 'a'
          else if (kind === 'wheat') ch = v % 2 ? 'e' : 'n'
          else if (kind === 'crops') ch = u % 2 ? 'c' : 'd'
          else if (kind === 'plough') ch = v % 2 ? 'b' : 'o'
          else if (kind === 'pasture') ch = fine[idx(x, y)]! < 0.25 ? 'p' : 'f'
          else ch = u % 2 === 0 && v < bh - 1 ? (v % 2 ? 's' : 't') : 'f'
          art[idx(x, y)] = ch
        }
      }
      x0 += bw
    }
    y0 += bh
  }
}

/** Overlapping crowns, lit from the top left, packed back to front over a dark understorey. */
function fillForest() {
  const crown = [' Ay ', 'Ayyx', 'yxxw', ' wz ']
  const dark = [' yx ', 'yxxw', 'xwwz', ' zz ']
  for (let i = 0; i < W * H; i++) if (terrain[i] === 'w') art[i] = fine[i]! < 0.5 ? 'z' : 'w'
  for (let y = -2; y < H; y += 3) {
    for (let x = -2 + ((y / 3) % 2 ? 1 : -1); x < W; x += 3) {
      const tx = x + Math.floor(rnd() * 2)
      const ty = y + Math.floor(rnd() * 2)
      const shape = rnd() < 0.3 ? dark : crown
      shape.forEach((row, v) => [...row].forEach((ch, u) => ch !== ' ' && set(tx + u, ty + v, ch, 'w')))
    }
  }
}

/** Peaks along the crescent, shadowed on the right, snow on the tallest; scree between them. */
function fillMountains() {
  for (let i = 0; i < W * H; i++) {
    if (terrain[i] === 'f') art[i] = pick(['F', 'K', 'H', 'F', 'L'])
  }
  const peaks: { x: number; y: number; h: number }[] = []
  for (let a = -Math.PI; a < Math.PI; a += 0.14 + rnd() * 0.1) {
    const r = CITY_R + 3 + rnd() * 6
    peaks.push({ x: Math.round(CX + Math.cos(a) * r * STRETCH), y: Math.round(CY + Math.sin(a) * r), h: 0 })
  }
  for (const p of peaks) p.h = 5 + Math.floor(rnd() * 6)
  peaks.sort((a, b) => a.y - b.y)
  for (const { x: px, y: py, h } of peaks) {
    for (let v = 0; v <= h; v++) {
      const y = py - 2 + v
      for (let x = px - v; x <= px + v; x++) {
        if (!isT(x, y, 'f')) continue
        const snow = h >= 6 && v <= h * 0.35
        let ch = x < px ? (snow ? 'G' : 'D') : x === px ? (snow ? 'G' : 'K') : snow ? 'I' : 'E'
        if (!snow && x > px && x === px + v) ch = 'J'
        if (!snow && x < px && x === px - v) ch = 'F'
        art[idx(x, y)] = ch
      }
    }
  }
}

function fillCoast() {
  for (let y = 0; y < H; y++) {
    const shore = shoreX(y)
    for (let x = 0; x < W; x++) {
      const t = terrain[idx(x, y)]
      if (t !== 'c' && t !== 's') continue
      const d = x + 0.5 - shore
      const f = fine[idx(x, y)]!
      let ch: string
      if (d < -2.5) ch = f < 0.3 ? 'p' : 'f'
      else if (d < -1) ch = 'r'
      else if (d < 0) ch = 'g'
      else if (d < 1) ch = f < 0.75 ? 'h' : 'i'
      else if (d < 3) ch = 'i'
      else if (d < 6.5) ch = f < 0.06 ? 'h' : 'j'
      else if (d < 10.5) ch = f < 0.05 ? 'h' : 'k'
      else ch = f < 0.01 ? 'h' : f < 0.2 ? 'l' : 'm'
      art[idx(x, y)] = ch
    }
  }
}

/** Walls round the rim, a street grid squared to the palace, and roof blocks shaded top to bottom. */
function fillCity() {
  const roofs = [['P', 'S'], ['P', 'S'], ['V', 'Q'], ['O', 'R'], ['O', 'S'], ['W', 'y']] as const
  const blockRoof = new Map<string, readonly [string, string]>()
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!isT(x, y, 'k')) continue
      const outside = (nx: number, ny: number) => !isT(nx, ny, 'k') && !isT(nx, ny, 't')
      const rim = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]].some(([nx, ny]) => outside(nx!, ny!))
      const nearRim = [[x + 2, y], [x - 2, y], [x, y + 2], [x, y - 2], [x + 1, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1]]
        .some(([nx, ny]) => outside(nx!, ny!))
      const u = x - CX + 100
      const v = y - CY + 100
      let ch: string
      if (rim) ch = 'J'
      else if (nearRim) ch = 'M'
      else if (u % 5 === 0 || v % 4 === 0) ch = 'N'
      else {
        const block = `${Math.floor(u / 5)},${Math.floor(v / 4)}`
        if (!blockRoof.has(block)) blockRoof.set(block, pick(roofs))
        const [top, bottom] = blockRoof.get(block)!
        ch = v % 4 === 3 ? bottom : top
      }
      art[idx(x, y)] = ch
    }
  }
}

function fillPalace() {
  const { x0, x1, y0, y1 } = PALACE
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x < x1; x++) {
      const u = x - x0
      const v = y - y0
      const w = x1 - x0
      const h = y1 - y0
      const edge = u === 0 || v === 0 || u === w - 1 || v === h
      const tower = (u < 2 || u >= w - 2) && (v < 2 || v > h - 2)
      let ch: string
      if (tower) ch = v === 0 ? 'Z' : '2'
      else if (edge) ch = v === h && Math.abs(u - (w - 1) / 2) < 1 ? '4' : u % 2 ? 'X' : 'Y'
      else if (u < 3 || u >= w - 3 || v < 2 || v > h - 2) ch = (u + v) % 2 ? 'W' : 'N'
      else if (v === 2) ch = u % 2 ? '1' : 'X'
      else if (v < 6) ch = Math.abs(u - (w - 1) / 2) < 2 ? 'X' : v === 5 ? '3' : '2'
      else if (v < h - 2) ch = Math.abs(u - (w - 1) / 2) < 1 ? '4' : u % 3 === 0 ? '1' : 'Y'
      else ch = 'N'
      art[idx(x, y)] = ch
    }
  }
}

fillFields()
fillForest()
fillMountains()
fillCoast()
fillCity()
fillPalace()

// ---- Landmarks ----

/** A 4-connected line from point to point, so roads and rivers never break at a diagonal. */
function trace(points: readonly (readonly [number, number])[], draw: (x: number, y: number) => void) {
  for (let k = 1; k < points.length; k++) {
    const [x0, y0] = points[k - 1]!
    const [x1, y1] = points[k]!
    const steps = Math.abs(x1 - x0) + Math.abs(y1 - y0)
    let [x, y] = [x0, y0]
    draw(x, y)
    for (let s = 1; s <= steps; s++) {
      // Step whichever axis lags furthest behind the straight line at this point.
      const lagX = Math.abs(x0 + ((x1 - x0) * s) / steps - x)
      const lagY = Math.abs(y0 + ((y1 - y0) * s) / steps - y)
      if (x !== x1 && (lagX >= lagY || y === y1)) x += Math.sign(x1 - x)
      else y += Math.sign(y1 - y)
      draw(x, y)
    }
  }
}

const road = (x: number, y: number) => {
  const t = inGrid(x, y) ? terrain[idx(x, y)] : 's'
  if (t === 's' || t === 't') return
  if (t === 'k') return set(x, y, 'N')
  set(x, y, 'q')
}

const HARBOUR_Y = 40
const RIVER_MOUTH_Y = 24

// The river rises among the forge's eastern peaks and runs through the forest to the sea above the harbour.
const SOURCE = [Math.round(CX + Math.cos(-0.55) * (CITY_R + 6) * STRETCH), Math.round(CY + Math.sin(-0.55) * (CITY_R + 6))] as const
trace(
  [SOURCE, [SOURCE[0] + 5, SOURCE[1] - 3], [80, 27], [85, 28], [89, RIVER_MOUTH_Y + 1], [Math.ceil(shoreX(RIVER_MOUTH_Y)) + 1, RIVER_MOUTH_Y]],
  (x, y) => {
    const t = inGrid(x, y) ? terrain[idx(x, y)] : 's'
    if (t === 's' || (t === 'c' && x + 0.5 > shoreX(y) + 1)) return
    set(x, y, 'u')
    if (t !== 'f') set(x, y + 1, 'v')
  },
)

// The king's road: west fields to the south gate; the passes: the city's north side out through the forge.
trace([[0, 66], [18, 64], [34, 60], [46, 56], [CX, 52], [CX, PALACE.y1 + 1]], road)
trace([[CX, 52], [72, 56], [84, 58], [Math.round(coastLandX(HARBOUR_Y)), HARBOUR_Y + 6], [94, HARBOUR_Y]], road)
trace([[CX - 4, PALACE.y0 - 1], [CX - 8, 22], [CX - 16, 13], [CX - 22, 0]], road)
trace([[CX + 6, PALACE.y0 - 1], [CX + 10, 21], [CX + 20, 12], [CX + 24, 0]], road)

// The harbour: a quayside town in rows of houses, two long piers and boats moored between them.
for (let y = HARBOUR_Y - 5; y <= HARBOUR_Y + 5; y++) {
  const shore = Math.floor(shoreX(y))
  const row = (y - HARBOUR_Y + 6) % 3
  for (let x = Math.ceil(coastLandX(y)) + 1; x < shore - 1; x++) {
    const gap = x % 4 === 0
    set(x, y, row === 0 || gap ? 'q' : row === 1 ? (x % 8 < 4 ? 'P' : 's') : x % 4 === 2 ? 'o' : 't', 'c')
  }
  set(shore - 1, y, '0', 'c')
}
const QUAY_X = Math.floor(shoreX(HARBOUR_Y))
for (const py of [HARBOUR_Y - 4, HARBOUR_Y + 4]) {
  for (let x = Math.floor(shoreX(py)); x < QUAY_X + 8; x++) set(x, py, '0', 'c')
}
for (const [bx, by] of [[2, -1], [6, 1], [2, 3], [10, -2], [13, 2]] as const) {
  const x = QUAY_X + bx
  set(x, HARBOUR_Y + by - 1, 'B', 'c')
  set(x, HARBOUR_Y + by, 'C', 'c')
  set(x + 1, HARBOUR_Y + by, 'C', 'c')
}

// Forges glowing on the inner slopes.
for (const a of [-2.6, -1.9, -1.1, -0.4, 0.3]) {
  const x = Math.round(CX + Math.cos(a) * (CITY_R + 2) * STRETCH)
  const y = Math.round(CY + Math.sin(a) * (CITY_R + 2))
  set(x, y, 'T', 'f')
  set(x + 1, y, 'U', 'f')
  set(x, y + 1, 'J', 'f')
  set(x + 1, y + 1, 'J', 'f')
}

// ---- Self-checks ----

const regionOf = (i: number): Key | null => {
  const t = terrain[i]!
  return t !== 's' && interior(i % W, Math.floor(i / W)) ? t : null
}
const problems: string[] = []
const counts = PROVINCES.map(({ key, id, target }) => {
  const cells = terrain.flatMap((_, i) => (regionOf(i) === key ? [i] : []))
  const pieces = components(i => regionOf(i) === key).length
  if (pieces !== 1) problems.push(`${id} is in ${pieces} pieces`)
  if (Math.abs(cells.length - target) > target * 0.2) problems.push(`${id} has ${cells.length} cells, target ${target} ±20%`)
  return { province: id, cells: cells.length, target, off: `${Math.round((cells.length / target - 1) * 100)}%` }
})
const borders = (a: Key, b: Key) =>
  terrain.some((_, i) => regionOf(i) === a && [i + 1, i - 1, i + W, i - W].some(j => j >= 0 && j < W * H && regionOf(j) === b && Math.abs((j % W) - (i % W)) <= 1))
for (let k = 1; k < PROVINCES.length; k++) {
  const [a, b] = [PROVINCES[k - 1]!, PROVINCES[k]!]
  if (!borders(a.key, b.key)) problems.push(`${a.id} doesn't border ${b.id}`)
}
if (art.includes('.') || art.length !== W * H) problems.push('art has unpainted cells')

const rowsOf = (cells: readonly string[]) => Array.from({ length: H }, (_, y) => cells.slice(y * W, (y + 1) * W).join(''))
const regionRows = rowsOf(terrain.map((_, i) => regionOf(i) ?? '.'))
console.table(counts)
if (problems.length > 0) {
  console.error(regionRows.join('\n'))
  throw new Error(`Imperium map:\n  ${problems.join('\n  ')}`)
}

// ---- Write ----

const map: MapDef = {
  palette: PALETTE,
  rows: rowsOf(art),
  regions: {
    key: Object.fromEntries(PROVINCES.map(p => [p.key, p.id])),
    rows: regionRows,
  },
}
const list = (rows: string[], indent: string) => rows.map(r => `${indent}${JSON.stringify(r)}`).join(',\n')
writeFileSync(
  OUT,
  `{
  "palette": ${JSON.stringify(map.palette).replaceAll('","', '", "').replaceAll('":"', '": "')},
  "rows": [
${list(map.rows, '    ')}
  ],
  "regions": {
    "key": ${JSON.stringify(map.regions.key).replaceAll('","', '", "').replaceAll('":"', '": "')},
    "rows": [
${list(map.regions.rows, '      ')}
    ]
  }
}
`,
)
console.log(`Wrote ${W}×${H} map to ${OUT.pathname}`)
