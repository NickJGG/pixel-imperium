/**
 * Generates `data/campaigns/imperium/map.json`: the Imperium's Journey, one 120×44 top-down Map per
 * province from the Marches down to the Throne, each overlapping the next by 12 rows, joined by one
 * Road through every Landmark. Deterministic, so a rerun rewrites the same file.
 *
 * Steps: the Road is laid first (Catmull-Rom through the Landmarks and a waypoint mid-overlap), each
 * province's painter fills its Map knowing where the Road runs, the overlap rows are dithered so
 * neighbours agree, then the rivers and their bridges are stamped across every Map they touch.
 * Self-checks throw if the result breaks the campaign's rules.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { type CampaignDef, type JourneyDef, journeyProblems, parseJourney } from './campaigns.ts'

const W = 120
const H = 44
const STEP = 32
const DIR = new URL('../data/campaigns/imperium/', import.meta.url)
const OUT = new URL('map.json', DIR)

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
const WATER = new Set('hijklmuv')

let seed = 20261007
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
const pick = <T>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]!
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v))

/** Smooth value noise in [0, 1] over one Map, with a lattice every `cell` cells. */
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

type Pt = { x: number; y: number }
const idx = (x: number, y: number) => y * W + x
const inGrid = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H

const campaign = JSON.parse(readFileSync(new URL('campaign.json', DIR), 'utf8')) as CampaignDef
const PROVINCES = campaign.provinces.map(p => p.id)
const N = PROVINCES.length
const JOURNEY_H = (N - 1) * STEP + H

/** Alternating sides of the middle, so the Road swings while a phone crop keeps every Landmark. */
const LANDMARKS: Pt[] = PROVINCES.map((_, i) => ({ x: Math.round(W * (i % 2 ? 0.62 : 0.38)), y: H / 2 }))
const toJourney = (i: number, p: Pt): Pt => ({ x: p.x, y: i * STEP + p.y })

// ---- The Road ----

function catmullRom(points: readonly Pt[]): Pt[] {
  const P = [points[0]!, ...points, points.at(-1)!]
  const out: Pt[] = []
  for (let i = 1; i < P.length - 2; i++) {
    const [p0, p1, p2, p3] = [P[i - 1]!, P[i]!, P[i + 1]!, P[i + 2]!]
    for (let s = 0; s < 64; s++) {
      const t = s / 64
      const f = (k: 'x' | 'y') =>
        0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t)
      out.push({ x: Math.round(f('x')), y: Math.round(f('y')) })
    }
  }
  out.push(points.at(-1)!)
  return out
}

const stops = LANDMARKS.map((l, i) => toJourney(i, l))
const isStop = (p: Pt) => stops.some(s => s.x === p.x && s.y === p.y)
const adjacent = (a: Pt, b: Pt) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) <= 1

/** 8-connected, with the corner cells of any staircase dropped so the Road is one cell thin. */
const ROAD: Pt[] = (() => {
  const controls = stops.flatMap((s, i) => {
    if (i === 0) return [s]
    const prev = stops[i - 1]!
    const overlapMid = (i * STEP + (i - 1) * STEP + H) / 2
    return [{ x: Math.round((prev.x + s.x) / 2 + (i % 2 ? 6 : -6)), y: Math.round(overlapMid) }, s]
  })
  const out: Pt[] = []
  const push = (p: Pt) => {
    const last = out.at(-1)
    if (last && last.x === p.x && last.y === p.y) return
    while (out.length >= 2 && !isStop(out.at(-1)!) && adjacent(out.at(-2)!, p)) out.pop()
    out.push(p)
  }
  for (const target of catmullRom(controls)) {
    let cur = out.at(-1) ?? target
    while (cur.x !== target.x || cur.y !== target.y) {
      cur = { x: cur.x + Math.sign(target.x - cur.x), y: cur.y + Math.sign(target.y - cur.y) }
      push(cur)
    }
    push(target)
  }
  return out
})()

/** Each cell's distance from the Road, for painters that clear a way for it. */
function roadDistance(i: number): Float32Array {
  const local = ROAD.map(p => ({ x: p.x, y: p.y - i * STEP })).filter(p => p.y > -8 && p.y < H + 8)
  return Float32Array.from({ length: W * H }, (_, c) =>
    Math.min(Infinity, ...local.map(p => Math.hypot(p.x - (c % W), p.y - Math.floor(c / W)))),
  )
}

// ---- Painting ----

class Art {
  readonly cells: string[] = new Array<string>(W * H).fill('.')
  get(x: number, y: number) {
    return inGrid(x, y) ? this.cells[idx(x, y)]! : '.'
  }
  set(x: number, y: number, ch: string) {
    x = Math.round(x)
    y = Math.round(y)
    if (inGrid(x, y)) this.cells[idx(x, y)] = ch
  }
  rect(x: number, y: number, w: number, h: number, ch: string) {
    for (let v = 0; v < h; v++) for (let u = 0; u < w; u++) this.set(x + u, y + v, ch)
  }
  each(f: (x: number, y: number) => string | undefined) {
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ch = f(x, y)
        if (ch !== undefined) this.cells[idx(x, y)] = ch
      }
    }
  }
}

type Painter = (art: Art, L: Pt, road: Float32Array) => void
const fine = () => Array.from({ length: W * H }, rnd)

/** A cottage seen from above: a roof shaded front to back, the wall showing below. */
function house(art: Art, x: number, y: number, roof: string, eave: string, wall = 't') {
  art.rect(x, y, 3, 1, roof)
  art.rect(x, y + 1, 3, 1, eave)
  art.rect(x, y + 2, 3, 1, wall)
  art.set(x + 1, y + 2, 'C')
}

/** Hedged plots in bands, each band split at its own columns so the patchwork never lines up. */
function fillFields(art: Art) {
  const kinds = ['wheat', 'wheat', 'crops', 'crops', 'plough', 'pasture', 'pasture'] as const
  const grain = fine()
  for (let y0 = 0; y0 < H; ) {
    const bh = 4 + Math.floor(rnd() * 4)
    for (let x0 = -Math.floor(rnd() * 6); x0 < W; ) {
      const bw = 5 + Math.floor(rnd() * 6)
      const kind = pick(kinds)
      for (let y = y0; y < Math.min(H, y0 + bh); y++) {
        for (let x = Math.max(0, x0); x < Math.min(W, x0 + bw); x++) {
          const u = x - x0
          const v = y - y0
          const f = grain[idx(x, y)]!
          let ch: string
          if (v === 0 || u === 0) ch = f < 0.12 ? 'x' : 'a'
          else if (kind === 'wheat') ch = v % 2 ? 'e' : 'n'
          else if (kind === 'crops') ch = u % 2 ? 'c' : 'd'
          else if (kind === 'plough') ch = v % 2 ? 'b' : 'o'
          else ch = f < 0.25 ? 'p' : 'f'
          art.set(x, y, ch)
        }
      }
      x0 += bw
    }
    y0 += bh
  }
}

/** Overlapping crowns, lit from the top left, packed back to front over a dark understorey. */
function fillForest(art: Art) {
  const crown = [' Ay ', 'Ayyx', 'yxxw', ' wz ']
  const dark = [' yx ', 'yxxw', 'xwwz', ' zz ']
  const under = fine()
  art.each((x, y) => (under[idx(x, y)]! < 0.5 ? 'z' : 'w'))
  for (let y = -2; y < H; y += 3) {
    for (let x = -2 + ((y / 3) % 2 ? 1 : -1); x < W; x += 3) {
      const tx = x + Math.floor(rnd() * 2)
      const ty = y + Math.floor(rnd() * 2)
      const shape = rnd() < 0.3 ? dark : crown
      shape.forEach((row, v) => [...row].forEach((ch, u) => ch !== ' ' && art.set(tx + u, ty + v, ch)))
    }
  }
}

const PAINTERS: Record<string, Painter> = {
  marches(art, L) {
    fillFields(art)
    const grass = fine()
    art.each((x, y) => {
      const d = Math.hypot((x - L.x) / 1.6, y - L.y)
      if (d < 4.6) return grass[idx(x, y)]! < 0.2 ? 'p' : 'f'
      if (d < 5.4) return 'a'
      return undefined
    })
    for (const [dx, dy, roof] of [[-8, -4, 's'], [-3, -6, 'P'], [3, -5, 's'], [-9, 1, 'P'], [5, 1, 's'], [-4, 3, 's'], [1, 4, 'P']] as const) {
      house(art, L.x + dx, L.y + dy, roof, 'S')
    }
    art.set(L.x - 2, L.y - 1, 'C')
    art.set(L.x - 2, L.y - 2, 'A')
  },

  coast(art, L) {
    const n = noise(6)
    const scrub = noise(4)
    const grass = fine()
    const shoreX = (y: number) => L.x + 11 + (n(0, y) - 0.5) * 8 + (y - L.y) * 0.25
    art.each((x, y) => {
      const d = x + 0.5 - shoreX(y)
      const f = (x * 7 + y * 13) % 17
      if (d > 22) return f === 0 ? 'l' : 'm'
      if (d > 12) return f === 0 ? 'j' : 'k'
      if (d > 2) return f === 0 ? 'i' : 'j'
      if (d > 1) return 'i'
      if (d > 0) return 'h'
      if (d > -2) return (x + y) % 4 ? 'g' : 'r'
      if (d > -3) return 'r'
      const s = scrub(x, y)
      const g = grass[idx(x, y)]!
      if (s > 0.68) return g < 0.5 ? 'x' : 'a'
      if (s > 0.6) return 'p'
      return g < 0.03 ? 'B' : g < 0.1 ? 'd' : 'f'
    })
    // The quayside town: rows of houses behind a cobbled quay, a pier out past the shallows, boats moored along it.
    const quay = Math.floor(shoreX(L.y)) - 1
    for (let y = L.y - 6; y <= L.y + 5; y++) {
      for (let x = L.x - 8; x < Math.floor(shoreX(y)) - 1; x++) art.set(x, y, 'q')
      art.set(Math.floor(shoreX(y)) - 1, y, '0')
    }
    for (const row of [L.y - 5, L.y + 2]) {
      for (let x = L.x - 7; x + 3 <= quay - 1; x += 4) {
        if (Math.abs(x + 1 - L.x) < 2) continue
        house(art, x, row, (x + row) % 3 ? 'P' : 's', 'S')
      }
    }
    art.rect(quay, L.y - 1, 10, 1, '0')
    art.rect(quay + 9, L.y - 3, 1, 5, '0')
    for (const [bx, by] of [[3, -3], [6, 1], [12, -5], [13, 2], [17, -1]] as const) {
      art.set(quay + bx, L.y + by - 1, 'B')
      art.rect(quay + bx - 1, L.y + by, 3, 1, 'C')
    }
  },

  wildwood(art, L, road) {
    fillForest(art)
    const glade = noise(9)
    const grass = fine()
    art.each((x, y) => {
      const d = Math.hypot((x - L.x) / 1.6, y - L.y)
      const open = d < 5 || road[idx(x, y)]! < 2.2 || glade(x, y) > 0.8
      if (open) return grass[idx(x, y)]! < 0.18 ? 'c' : 'f'
      if (d < 6) return 'p'
      return undefined
    })
    // A woodcutter's hut and its fire.
    art.rect(L.x - 6, L.y - 3, 4, 1, '0')
    art.rect(L.x - 6, L.y - 2, 4, 1, 'C')
    art.set(L.x + 4, L.y + 2, 'T')
    art.set(L.x + 5, L.y + 2, 'U')
    art.set(L.x + 4, L.y + 3, 'M')
    art.rect(L.x + 6, L.y - 3, 3, 1, 'o')
  },

  forge(art, L, road) {
    const ridge = noise(6)
    const crag = noise(2)
    const height = (x: number, y: number) => {
      const v = ridge(x, y) * 0.75 + crag(x, y) * 0.25
      const town = Math.exp(-Math.hypot((x - L.x) / 2, y - L.y) / 4)
      const pass = Math.exp(-road[idx(clamp(x, 0, W - 1), clamp(y, 0, H - 1))]! / 3)
      return v * 1.5 - 0.5 * Math.max(town, pass) - 0.15
    }
    const grit = fine()
    art.each((x, y) => {
      const h = height(x, y)
      // Lit faces climb toward the top left.
      const lit = h >= height(x + 1, y + 1)
      const g = grit[idx(x, y)]!
      if (h > 0.9) return lit ? 'G' : 'I'
      if (h > 0.7) return lit ? 'D' : 'E'
      if (h > 0.48) return lit ? 'F' : 'K'
      if (h > 0.26) return lit ? 'H' : 'M'
      return g < 0.3 ? 'H' : g < 0.5 ? 'L' : 'N'
    })
    // The forge town: smithies round a yard, each with its fire.
    for (const [dx, dy] of [[-9, -4], [-5, -5], [4, -5], [8, -3], [-9, 2], [5, 2], [9, 3]] as const) {
      art.rect(L.x + dx, L.y + dy, 3, 2, 'J')
      art.set(L.x + dx + 1, L.y + dy + 1, (dx + dy) % 2 ? 'T' : 'U')
      art.set(L.x + dx, L.y + dy + 2, 'M')
    }
  },

  capital(art, L, road) {
    const cx = W / 2
    const cy = H / 2
    const rx = W * 0.4
    const ry = H * 0.38
    const roofs = [['P', 'S'], ['P', 'S'], ['V', 'Q'], ['O', 'R'], ['O', 'S'], ['W', 'y']] as const
    const blockRoof = new Map<string, readonly [string, string]>()
    art.each((x, y) => {
      const d = Math.hypot((x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry)
      const near = road[idx(x, y)]! < 1.5
      if (d > 1.08) return pick(['f', 'f', 'p', 'c'])
      if (d > 1) return near ? 'N' : (x + y) % 3 ? 'J' : 'M'
      if (d > 0.95) return near ? 'N' : 'M'
      const plaza = Math.hypot((x - L.x) / 1.5, y - L.y)
      if (plaza < 4) return (x + y) % 2 ? 'Y' : 't'
      if (near || x % 5 === 0 || y % 4 === 0) return 'N'
      const block = `${Math.floor(x / 5)},${Math.floor(y / 4)}`
      if (!blockRoof.has(block)) blockRoof.set(block, pick(roofs))
      const [top, bottom] = blockRoof.get(block)!
      return y % 4 === 3 ? bottom : top
    })
    // Towers on the wall.
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 5) {
      const x = Math.round(cx + Math.cos(a) * rx * 1.04)
      const y = Math.round(cy + Math.sin(a) * ry * 1.04)
      if (road[idx(clamp(x, 0, W - 1), clamp(y, 0, H - 1))]! < 3) continue
      art.rect(x - 1, y - 1, 2, 2, 'J')
      art.set(x - 1, y - 1, 'E')
    }
    art.set(L.x + 3, L.y - 1, 'u')
    art.set(L.x + 3, L.y, 'v')
  },

  throne(art, L, road) {
    const pond = (x: number, y: number) =>
      Math.hypot((x - L.x + 38) / 1.6, y - L.y - 6) < 4 || Math.hypot((x - L.x - 32) / 1.6, y - L.y + 8) < 3.5
    const lawn = fine()
    art.each((x, y) => {
      const [u, v] = [x - L.x, y - L.y]
      if (pond(x, y)) return (x + y) % 5 ? 'j' : 'i'
      if (road[idx(x, y)]! < 2.5) return 't'
      if (Math.abs(u) > 27 || Math.abs(v) > 13) return lawn[idx(x, y)]! < 0.2 ? 'p' : 'f'
      if (Math.abs(u) > 25 || Math.abs(v) > 11) return 'g'
      const hx = ((u % 6) + 6) % 6
      const hy = ((v % 5) + 5) % 5
      if (hx === 0 || hy === 0) return 'g'
      if (hx === 1 || hx === 5 || hy === 1 || hy === 4) return 'a'
      return hx === 3 && hy === 2 && (u + v) % 4 === 0 ? 'Z' : 'p'
    })
    // Clipped trees dotted over the lawns.
    for (let k = 0; k < 40; k++) {
      const x = Math.floor(rnd() * W)
      const y = Math.floor(rnd() * H)
      if (Math.abs(x - L.x) < 30 && Math.abs(y - L.y) < 16) continue
      if (pond(x, y) || pond(x + 1, y + 1) || road[idx(x, y)]! < 4) continue
      art.rect(x, y, 2, 2, 'y')
      art.set(x, y, 'A')
      art.set(x + 1, y + 1, 'x')
    }
    // The palace: towers at the corners, gold eaves, a purple roof and its door on the Road.
    const [x0, x1, y0, y1] = [L.x - 11, L.x + 11, L.y - 6, L.y + 5]
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x < x1; x++) {
        const u = x - x0
        const v = y - y0
        const w = x1 - x0
        const h = y1 - y0
        const middle = Math.abs(u - (w - 1) / 2) < 1
        const tower = (u < 2 || u >= w - 2) && (v < 2 || v > h - 2)
        let ch: string
        if (tower) ch = v === 0 ? 'Z' : '2'
        else if (u === 0 || v === 0 || u === w - 1 || v === h) ch = v === 0 && middle ? '4' : u % 2 ? 'X' : 'Y'
        else if (u < 3 || u >= w - 3 || v < 2 || v > h - 2) ch = (u + v) % 2 ? 'W' : 'N'
        else if (v === 2) ch = u % 2 ? '1' : 'X'
        else if (v < 6) ch = Math.abs(u - (w - 1) / 2) < 2 ? 'X' : v === 5 ? '3' : '2'
        else if (v < h - 2) ch = middle ? '4' : u % 3 === 0 ? '1' : 'Y'
        else ch = 'N'
        art.set(x, y, ch)
      }
    }
  },
}

const maps = PROVINCES.map((id, i) => {
  const painter = PAINTERS[id]
  if (!painter) throw new Error(`no painter for province '${id}'`)
  const art = new Art()
  painter(art, LANDMARKS[i]!, roadDistance(i))
  return art
})

// Neighbours share their overlap rows, each cell taken from one or the other along a ragged, clumpy seam.
const blob = noise(3)
for (let i = 1; i < N; i++) {
  const [upper, lower] = [maps[i - 1]!, maps[i]!]
  for (let y = 0; y < H - STEP; y++) {
    const t = (y + 0.5) / (H - STEP)
    for (let x = 0; x < W; x++) {
      const k = t + (blob(x, y + i * 7) - 0.5) * 0.7 + (rnd() - 0.5) * 0.25
      const ch = k > 0.5 ? lower.get(x, y) : upper.get(x, y + STEP)
      lower.set(x, y, ch)
      upper.set(x, y + STEP, ch)
    }
  }
}

/** Calls `draw` with each Map that covers journey cell (x, y), in its local coordinates. */
function stamp(x: number, y: number, draw: (art: Art, lx: number, ly: number) => void) {
  for (let i = 0; i < N; i++) {
    const ly = y - i * STEP
    if (inGrid(x, ly)) draw(maps[i]!, x, ly)
  }
}

/** A 4-connected line from point to point, so a river never breaks at a diagonal. */
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

// Rivers in journey coordinates: the Marches stream out to sea above the harbour, one through the Wildwood, one through the Capital.
const RIVERS: (readonly [number, number])[][] = [
  [[28, 0], [34, 12], [36, 26], [44, 38], [62, 45], [100, 48]],
  [[0, 90], [30, 96], [60, 93], [90, 97], [119, 92]],
  [[0, 160], [40, 156], [80, 160], [119, 155]],
]
for (const river of RIVERS) {
  trace(river, (x, y) =>
    stamp(x, y, (art, lx, ly) => {
      if (WATER.has(art.get(lx, ly)) && art.get(lx, ly) !== 'u' && art.get(lx, ly) !== 'v') return
      art.set(lx, ly, 'u')
      if (!WATER.has(art.get(lx, ly + 1))) art.set(lx, ly + 1, (x + y) % 3 ? 'u' : 'v')
    }),
  )
}

// Planks under the Road wherever it crosses water, railed along the sides.
let bridged = 0
for (const p of ROAD) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const rail = Math.max(Math.abs(dx), Math.abs(dy)) === 2
      stamp(p.x + dx, p.y + dy, (art, lx, ly) => {
        if (!WATER.has(art.get(lx, ly))) return
        art.set(lx, ly, rail ? 'C' : '0')
        bridged++
      })
    }
  }
}

// ---- Self-checks ----

const rowsOf = (art: Art) => Array.from({ length: H }, (_, y) => art.cells.slice(y * W, (y + 1) * W).join(''))
const journey: JourneyDef = {
  palette: PALETTE,
  width: W,
  height: H,
  step: STEP,
  maps: Object.fromEntries(PROVINCES.map((id, i) => [id, { rows: rowsOf(maps[i]!), landmark: [LANDMARKS[i]!.x, LANDMARKS[i]!.y] }])),
  road: ROAD.map(p => [p.x, p.y]),
}
const problems = journeyProblems(parseJourney(campaign.id, journey, PROVINCES), PROVINCES, campaign.id)
for (const [i, art] of maps.entries()) if (art.cells.includes('.')) problems.push(`${PROVINCES[i]} has unpainted cells`)
if (ROAD.at(-1)!.y >= JOURNEY_H) problems.push('the road runs off the journey')
if (bridged === 0) problems.push('the road never crosses water')
if (problems.length > 0) throw new Error(`Imperium journey:\n  ${problems.join('\n  ')}`)

// ---- Write ----

const list = (rows: string[], indent: string) => rows.map(r => `${indent}${JSON.stringify(r)}`).join(',\n')
const road = Array.from({ length: Math.ceil(ROAD.length / 12) }, (_, k) =>
  journey.road.slice(k * 12, k * 12 + 12).map(([x, y]) => `[${x}, ${y}]`).join(', '),
)
writeFileSync(
  OUT,
  `{
  "palette": ${JSON.stringify(PALETTE).replaceAll('","', '", "').replaceAll('":"', '": "')},
  "width": ${W},
  "height": ${H},
  "step": ${STEP},
  "maps": {
${PROVINCES.map(
  id => `    "${id}": {
      "landmark": ${JSON.stringify(journey.maps[id]!.landmark).replace(',', ', ')},
      "rows": [
${list(journey.maps[id]!.rows, '        ')}
      ]
    }`,
).join(',\n')}
  },
  "road": [
${road.map(line => `    ${line}`).join(',\n')}
  ]
}
`,
)
console.log(`Wrote ${N} ${W}×${H} maps and a ${ROAD.length}-cell road to ${OUT.pathname}`)
