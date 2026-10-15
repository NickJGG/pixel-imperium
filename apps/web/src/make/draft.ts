/**
 * The /make editor's picture: cells hold hex colors, and `colors` is the strip's order, which number keys and
 * the exported palette follow. Every operation is pure and returns a new Draft. Palette letters are not kept:
 * `toSeed` assigns them by hue on export.
 */

/** A puzzle as the server's data files hold it (`SeedPuzzle` in apps/server). */
export interface Seed {
  id: string
  title: string
  palette: Record<string, string>
  rows: string[]
}

export interface Draft {
  id: string
  title: string
  width: number
  height: number
  cells: (string | null)[]
  colors: string[]
}

export interface Pos {
  row: number
  col: number
}

export const MIN_SIZE = 5
export const MAX_SIZE = 30
export const MAX_COLORS = 10

const HEX = /^#[0-9a-f]{6}$/i

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

export function fromSeed(seed: Seed): Draft {
  const height = seed.rows.length
  const width = seed.rows[0]?.length ?? 0
  const colors: string[] = []
  for (const hex of Object.values(seed.palette)) {
    const c = hex.toLowerCase()
    if (!colors.includes(c)) colors.push(c)
  }
  const cells = seed.rows.flatMap(row => [...row].map(ch => (ch === '.' ? null : seed.palette[ch]!.toLowerCase())))
  return { id: seed.id, title: seed.title, width, height, cells, colors }
}

/** The palette entries the picture uses, in strip order, lettered by `paletteLetters`. */
export function toSeed(draft: Draft): Seed {
  const letters = paletteLetters(draft.colors)
  const used = new Set(draft.cells)
  const palette: Record<string, string> = {}
  draft.colors.forEach((c, i) => {
    if (used.has(c)) palette[letters[i]!] = c
  })
  const letterOf = new Map(draft.colors.map((c, i) => [c, letters[i]!]))
  const rows = Array.from({ length: draft.height }, (_, r) =>
    draft.cells
      .slice(r * draft.width, (r + 1) * draft.width)
      .map(c => (c === null ? '.' : letterOf.get(c)!))
      .join(''),
  )
  return { id: draft.id, title: draft.title, palette, rows }
}

/** As the data files lay a puzzle out: the palette on one line, a row per line. `indent` prefixes every line. */
export function formatSeed(seed: Seed, indent = ''): string {
  const q = (s: string) => JSON.stringify(s)
  const entries = Object.entries(seed.palette).map(([k, v]) => `${q(k)}: ${q(v)}`)
  const palette = entries.length === 0 ? '{}' : `{ ${entries.join(', ')} }`
  return [
    '{',
    `  "id": ${q(seed.id)},`,
    `  "title": ${q(seed.title)},`,
    `  "palette": ${palette},`,
    '  "rows": [',
    ...seed.rows.map((row, i) => `    ${q(row)}${i < seed.rows.length - 1 ? ',' : ''}`),
    '  ]',
    '}',
  ]
    .map(line => indent + line)
    .join('\n')
}

/** Reads one SeedPuzzle out of pasted text, or throws an Error whose message says what's wrong with it. */
export function parsePaste(text: string): Seed {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error("That isn't JSON.")
  }
  if (Array.isArray(value)) throw new Error('That is a list of puzzles. Paste just one.')
  if (!value || typeof value !== 'object') throw new Error('That JSON is not a puzzle.')
  const { id, title, palette, rows } = value as Record<string, unknown>
  if (typeof id !== 'string' || id === '') throw new Error('The puzzle has no "id".')
  if (typeof title !== 'string') throw new Error('The puzzle has no "title".')
  if (!palette || typeof palette !== 'object' || Array.isArray(palette)) throw new Error('The puzzle has no "palette".')
  for (const [k, v] of Object.entries(palette)) {
    if (k.length !== 1 || k === '.') throw new Error(`Palette key "${k}" must be one character other than ".".`)
    if (typeof v !== 'string' || !HEX.test(v)) throw new Error(`Palette color "${k}" must be a hex like #a1b2c3.`)
  }
  if (!Array.isArray(rows) || rows.length === 0 || !rows.every(r => typeof r === 'string'))
    throw new Error('The puzzle needs "rows": a list of strings.')
  const width = (rows[0] as string).length
  if (width === 0) throw new Error('The picture is empty.')
  for (const [r, row] of (rows as string[]).entries()) {
    if (row.length !== width) throw new Error(`Row ${r + 1} is ${row.length} wide, expected ${width}.`)
    for (const ch of row) {
      if (ch !== '.' && !(ch in palette)) throw new Error(`Row ${r + 1} uses "${ch}", which isn't in the palette.`)
    }
  }
  if (Object.keys(palette).length > MAX_COLORS) throw new Error(`A puzzle can use at most ${MAX_COLORS} colors.`)
  return { id, title, palette: palette as Record<string, string>, rows: rows as string[] }
}

function hsl(hex: string): { h: number; s: number; l: number } {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = d / (1 - Math.abs(2 * l - 1))
  const h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s, l }
}

/** The letter a color would like: k dark, w light, s grey, n brown, else its hue's initial. */
export function preferredLetter(hex: string): string {
  const { h, s, l } = hsl(hex)
  if (l < 0.2) return 'k'
  if (l > 0.88 || (l > 0.8 && s < 0.4)) return 'w'
  if (s < 0.15) return 's'
  if (h >= 15 && h < 45 && l < 0.45) return 'n'
  if (h < 15 || h >= 345) return 'r'
  if (h < 40) return 'o'
  if (h < 70) return 'y'
  if (h < 170) return 'g'
  if (h < 250) return 'b'
  return 'p'
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'

/** A letter per color, in order: its preferred one, or the next free letter after it. */
export function paletteLetters(colors: readonly string[]): string[] {
  const taken = new Set<string>()
  return colors.map(c => {
    const start = ALPHABET.indexOf(preferredLetter(c))
    for (let k = 0; k < ALPHABET.length; k++) {
      const letter = ALPHABET[(start + k) % ALPHABET.length]!
      if (!taken.has(letter)) {
        taken.add(letter)
        return letter
      }
    }
    throw new Error('Out of palette letters')
  })
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
