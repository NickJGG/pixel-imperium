/**
 * The authored puzzle format, as the server's data files and share links hold it, and its conversion to and from
 * a Draft: the picture as an editor holds it.
 */
import { MAX_COLORS } from './checks.ts'

/** `rows` is the picture, `.` = empty and any other char a `palette` key. The solution is every non-`.` cell. */
export interface SeedPuzzle {
  id: string
  title: string
  palette: Record<string, string>
  rows: string[]
}

/**
 * Cells hold hex colors, and `colors` is the strip's order, which number keys and the exported palette follow.
 * Palette letters are not kept: `toSeed` assigns them by hue.
 */
export interface Draft {
  id: string
  title: string
  width: number
  height: number
  cells: (string | null)[]
  colors: string[]
}

const HEX = /^#[0-9a-f]{6}$/i

export function fromSeed(seed: SeedPuzzle): Draft {
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
export function toSeed(draft: Draft): SeedPuzzle {
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
export function formatSeed(seed: SeedPuzzle, indent = ''): string {
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
export function parsePaste(text: string): SeedPuzzle {
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
