/** The /make editor's operations on a Draft (`seed.ts` in the nonogram package). Every one is pure and returns a new Draft. */
import { type Draft, MAX_COLORS, MAX_SIZE, MIN_SIZE } from '@pixel-imperium/nonogram'

export type { Draft }

/** The server's limit on a title. */
export const MAX_TITLE = 80

export interface Pos {
  row: number
  col: number
}

export function blankDraft(width = 15, height = 15): Draft {
  return {
    id: 'untitled',
    title: 'Untitled',
    width,
    height,
    cells: Array<string | null>(width * height).fill(null),
    colors: ['#2e2a26', '#f2efe6'],
  }
}

export function slugify(title: string): string {
  return (
    title
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'untitled'
  )
}

const indexOf = (d: Draft, { row, col }: Pos) => row * d.width + col
const inside = (d: Draft, { row, col }: Pos) => row >= 0 && row < d.height && col >= 0 && col < d.width

/** `cells` plus, with `mirror`, each one reflected across the vertical middle. */
function withMirror(d: Draft, cells: readonly Pos[], mirror: boolean): Pos[] {
  return mirror ? cells.flatMap(p => [p, { row: p.row, col: d.width - 1 - p.col }]) : [...cells]
}

export function paint(d: Draft, at: readonly Pos[], color: string | null, mirror = false): Draft {
  const targets = withMirror(d, at, mirror).filter(p => inside(d, p))
  if (targets.every(p => d.cells[indexOf(d, p)] === color)) return d
  const cells = [...d.cells]
  for (const p of targets) cells[indexOf(d, p)] = color
  return { ...d, cells }
}

/** Bresenham's cells from `a` to `b`, both included. */
export function lineCells(a: Pos, b: Pos): Pos[] {
  const out: Pos[] = []
  let { col: x, row: y } = a
  const dx = Math.abs(b.col - x)
  const dy = -Math.abs(b.row - y)
  const sx = x < b.col ? 1 : -1
  const sy = y < b.row ? 1 : -1
  let err = dx + dy
  for (;;) {
    out.push({ row: y, col: x })
    if (x === b.col && y === b.row) return out
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

export const line = (d: Draft, a: Pos, b: Pos, color: string | null, mirror = false) =>
  paint(d, lineCells(a, b), color, mirror)

/** The outline of the box with corners `a` and `b`. */
export function rect(d: Draft, a: Pos, b: Pos, color: string | null, mirror = false): Draft {
  const [r0, r1] = [Math.min(a.row, b.row), Math.max(a.row, b.row)]
  const [c0, c1] = [Math.min(a.col, b.col), Math.max(a.col, b.col)]
  const cells: Pos[] = []
  for (let col = c0; col <= c1; col++) cells.push({ row: r0, col }, { row: r1, col })
  for (let row = r0 + 1; row < r1; row++) cells.push({ row, col: c0 }, { row, col: c1 })
  return paint(d, cells, color, mirror)
}

/** Floods the 4-connected region of `at`'s color. */
export function fill(d: Draft, at: Pos, color: string | null, mirror = false): Draft {
  const region = (start: Pos): Pos[] => {
    const from = d.cells[indexOf(d, start)]
    const seen = new Set([indexOf(d, start)])
    const stack = [start]
    const out: Pos[] = []
    while (stack.length) {
      const p = stack.pop()!
      out.push(p)
      for (const n of [
        { row: p.row - 1, col: p.col },
        { row: p.row + 1, col: p.col },
        { row: p.row, col: p.col - 1 },
        { row: p.row, col: p.col + 1 },
      ]) {
        const i = indexOf(d, n)
        if (inside(d, n) && !seen.has(i) && d.cells[i] === from) {
          seen.add(i)
          stack.push(n)
        }
      }
    }
    return out
  }
  if (!inside(d, at)) return d
  const starts = mirror ? [at, { row: at.row, col: d.width - 1 - at.col }] : [at]
  return paint(d, starts.flatMap(region), color)
}

export const pick = (d: Draft, at: Pos): string | null => (inside(d, at) ? d.cells[indexOf(d, at)]! : null)

/** Builds a same-size Draft whose cell at (row, col) is `source(row, col)`, `null` off the grid. */
function remap(d: Draft, source: (row: number, col: number) => Pos): Draft {
  const cells = d.cells.map((_, i) => pick(d, source(Math.floor(i / d.width), i % d.width)))
  return { ...d, cells }
}

export const flipH = (d: Draft) => remap(d, (row, col) => ({ row, col: d.width - 1 - col }))
export const flipV = (d: Draft) => remap(d, (row, col) => ({ row: d.height - 1 - row, col }))

/** Shifts the picture; what goes past an edge is lost. */
export const nudge = (d: Draft, dx: number, dy: number) => remap(d, (row, col) => ({ row: row - dy, col: col - dx }))

/** Grows or crops from the bottom-right, within MIN_SIZE–MAX_SIZE. */
export function resize(d: Draft, width: number, height: number): Draft {
  const w = Math.min(Math.max(width, MIN_SIZE), MAX_SIZE)
  const h = Math.min(Math.max(height, MIN_SIZE), MAX_SIZE)
  if (w === d.width && h === d.height) return d
  const cells = Array.from({ length: w * h }, (_, i) => pick(d, { row: Math.floor(i / w), col: i % w }))
  return { ...d, width: w, height: h, cells }
}

/** The next size a stepper lands on: the neighbouring multiple of 5, within bounds. */
export function stepSize(size: number, dir: 1 | -1): number {
  const next = dir > 0 ? Math.floor(size / 5) * 5 + 5 : Math.ceil(size / 5) * 5 - 5
  return Math.min(Math.max(next, MIN_SIZE), MAX_SIZE)
}

export function addColor(d: Draft, hex: string): Draft {
  const c = hex.toLowerCase()
  if (d.colors.includes(c) || d.colors.length >= MAX_COLORS) return d
  return { ...d, colors: [...d.colors, c] }
}

/** Drops a color; its cells go empty. */
export function removeColor(d: Draft, hex: string): Draft {
  if (!d.colors.includes(hex)) return d
  return { ...d, colors: d.colors.filter(c => c !== hex), cells: d.cells.map(c => (c === hex ? null : c)) }
}

export function moveColor(d: Draft, from: number, to: number): Draft {
  if (from === to || from < 0 || to < 0 || from >= d.colors.length || to >= d.colors.length) return d
  const colors = [...d.colors]
  const [moved] = colors.splice(from, 1)
  colors.splice(to, 0, moved!)
  return { ...d, colors }
}

/** Changes a color in place, its cells with it; a no-op if `hex` is already another of the strip's colors. */
export function recolor(d: Draft, from: string, hex: string): Draft {
  const to = hex.toLowerCase()
  if (from === to || !d.colors.includes(from) || d.colors.includes(to)) return d
  return { ...d, colors: d.colors.map(c => (c === from ? to : c)), cells: d.cells.map(c => (c === from ? to : c)) }
}
