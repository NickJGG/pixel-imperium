import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  type Draft,
  type Seed,
  addColor,
  blankDraft,
  fill,
  flipH,
  flipV,
  formatSeed,
  fromSeed,
  line,
  lineCells,
  moveColor,
  nudge,
  paint,
  paletteLetters,
  parsePaste,
  pick,
  rect,
  removeColor,
  resize,
  slugify,
  stepSize,
  toSeed,
} from './draft.ts'

const coastText = readFileSync(
  join(import.meta.dirname, '../../../server/data/campaigns/imperium/coast.json'),
  'utf8',
).replaceAll('\r\n', '\n')
const coast = JSON.parse(coastText) as Seed[]

const K = '#000000'
const W = '#ffffff'

/** A Draft from rows of `k`, `w` and `.`. */
const draftOf = (...rows: string[]): Draft =>
  fromSeed({ id: 't', title: 'T', palette: { k: K, w: W }, rows })

const rowsOf = (d: Draft) => toSeed(d).rows

/** The picture as hexes, so letter choices don't matter. */
const pixels = (seed: Seed) => seed.rows.map(row => [...row].map(ch => (ch === '.' ? null : seed.palette[ch]!.toLowerCase())))

describe('seeds', () => {
  it('formats the data file exactly', () => {
    expect(`[\n${coast.map(s => formatSeed(s, '  ')).join(',\n')}\n]\n`).toBe(coastText)
  })

  it('round-trips every coast puzzle through a draft', () => {
    for (const seed of coast) {
      const back = toSeed(fromSeed(seed))
      expect(back.id).toBe(seed.id)
      expect(back.title).toBe(seed.title)
      expect(pixels(back)).toEqual(pixels(seed))
      expect(toSeed(fromSeed(back))).toEqual(back)
      expect(parsePaste(formatSeed(back))).toEqual(back)
    }
  })

  it('exports only the colors in use, in strip order', () => {
    const d = { ...draftOf('k.', '..'), colors: [W, K] }
    expect(toSeed(d).palette).toEqual({ k: K })
    expect(toSeed(moveColor(draftOf('kw', '..'), 0, 1)).palette).toEqual({ w: W, k: K })
  })
})

describe('palette letters', () => {
  it('picks by hue', () => {
    expect(paletteLetters(['#1e1a1a', '#f2f4fb', '#5f626c', '#7a4f2a', '#e0475b', '#f08a24', '#ffc92e', '#5ec46f', '#2a7fd4', '#9b4f96'])).toEqual(
      ['k', 'w', 's', 'n', 'r', 'o', 'y', 'g', 'b', 'p'],
    )
  })

  it('falls back to the next free letter', () => {
    expect(paletteLetters(['#2a7fd4', '#17436f', '#7ab8e9'])).toEqual(['b', 'c', 'd'])
    expect(paletteLetters(['#000000', '#111111'])).toEqual(['k', 'l'])
  })
})

describe('parsePaste', () => {
  it('reads one puzzle', () => {
    expect(parsePaste(JSON.stringify(coast[0]))).toEqual(coast[0])
  })

  it.each([
    ['nope', /isn't JSON/],
    ['[]', /list of puzzles/],
    ['{"title":"x","palette":{},"rows":["."]}', /no "id"/],
    ['{"id":"x","title":"x","palette":{"k":"red"},"rows":["k"]}', /hex/],
    ['{"id":"x","title":"x","palette":{"k":"#000000"},"rows":["k","kk"]}', /Row 2 is 2 wide/],
    ['{"id":"x","title":"x","palette":{"k":"#000000"},"rows":["kq"]}', /uses "q"/],
  ])('rejects %s', (text, message) => {
    expect(() => parsePaste(text)).toThrow(message)
  })
})

describe('drawing', () => {
  it('paints, and mirrors across an even width', () => {
    const d = draftOf('....', '....')
    expect(rowsOf(paint(d, [{ row: 0, col: 0 }], K))).toEqual(['k...', '....'])
    expect(rowsOf(paint(d, [{ row: 1, col: 1 }], K, true))).toEqual(['....', '.kk.'])
  })

  it('mirrors onto itself down the middle column of an odd width', () => {
    const d = draftOf('.....')
    expect(rowsOf(paint(d, [{ row: 0, col: 2 }], K, true))).toEqual(['..k..'])
    expect(rowsOf(paint(d, [{ row: 0, col: 0 }], K, true))).toEqual(['k...k'])
  })

  it('paints empty', () => {
    expect(rowsOf(paint(draftOf('kk'), [{ row: 0, col: 1 }], null))).toEqual(['k.'])
  })

  it('draws Bresenham lines', () => {
    expect(lineCells({ row: 0, col: 0 }, { row: 1, col: 3 })).toEqual([
      { row: 0, col: 0 },
      { row: 0, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ])
    expect(rowsOf(line(draftOf('...', '...', '...'), { row: 2, col: 2 }, { row: 0, col: 0 }, K))).toEqual(['k..', '.k.', '..k'])
  })

  it('draws rectangle outlines from any corner', () => {
    expect(rowsOf(rect(draftOf('....', '....', '....'), { row: 2, col: 3 }, { row: 0, col: 0 }, W))).toEqual(['wwww', 'w..w', 'wwww'])
    expect(rowsOf(rect(draftOf('.....'), { row: 0, col: 0 }, { row: 0, col: 1 }, K, true))).toEqual(['kk.kk'])
  })

  it('floods a 4-connected region', () => {
    const d = draftOf('..k', 'kk.', '...')
    expect(rowsOf(fill(d, { row: 0, col: 0 }, W))).toEqual(['wwk', 'kk.', '...'])
    expect(rowsOf(fill(d, { row: 2, col: 0 }, W))).toEqual(['..k', 'kkw', 'www'])
    expect(rowsOf(fill(d, { row: 1, col: 0 }, null))).toEqual(['..k', '...', '...'])
  })

  it('floods the mirrored region too', () => {
    const d = draftOf('.k.k.')
    expect(rowsOf(fill(d, { row: 0, col: 0 }, W, true))).toEqual(['wk.kw'])
  })

  it('picks', () => {
    const d = draftOf('k.')
    expect(pick(d, { row: 0, col: 0 })).toBe(K)
    expect(pick(d, { row: 0, col: 1 })).toBeNull()
  })
})

describe('picture', () => {
  it('flips', () => {
    const d = draftOf('kw.', '...')
    expect(rowsOf(flipH(d))).toEqual(['.wk', '...'])
    expect(rowsOf(flipV(d))).toEqual(['...', 'kw.'])
  })

  it('nudges, losing what passes an edge', () => {
    const d = draftOf('k.w', '...')
    expect(rowsOf(nudge(d, 1, 0))).toEqual(['.k.', '...'])
    expect(rowsOf(nudge(d, -1, 1))).toEqual(['...', '.w.'])
  })

  it('resizes from the bottom-right within 5–30', () => {
    const d = paint({ ...blankDraft(5, 5), colors: [K] }, [{ row: 4, col: 4 }, { row: 0, col: 0 }], K)
    const grown = resize(d, 10, 5)
    expect(grown.width).toBe(10)
    expect(rowsOf(grown)[4]).toBe('....k.....')
    const back = resize(grown, 5, 5)
    expect(back.cells).toEqual(d.cells)
    expect(resize(d, 2, 99)).toMatchObject({ width: 5, height: 30 })
  })

  it('steps sizes by fives', () => {
    expect(stepSize(10, 1)).toBe(15)
    expect(stepSize(12, 1)).toBe(15)
    expect(stepSize(12, -1)).toBe(10)
    expect(stepSize(5, -1)).toBe(5)
    expect(stepSize(30, 1)).toBe(30)
  })
})

describe('colors', () => {
  it('adds a new color once, up to ten', () => {
    const d = blankDraft()
    expect(addColor(d, '#ABCDEF').colors.at(-1)).toBe('#abcdef')
    expect(addColor(d, d.colors[0]!)).toBe(d)
    const full = { ...d, colors: Array.from({ length: 10 }, (_, i) => `#00000${i}`) }
    expect(addColor(full, '#123456')).toBe(full)
  })

  it('removes a color, emptying its cells', () => {
    const d = removeColor(draftOf('kw'), K)
    expect(d.colors).toEqual([W])
    expect(d.cells).toEqual([null, W])
  })

  it('moves a color', () => {
    const d = { ...blankDraft(), colors: ['#000001', '#000002', '#000003'] }
    expect(moveColor(d, 2, 0).colors).toEqual(['#000003', '#000001', '#000002'])
    expect(moveColor(d, 0, 1).colors).toEqual(['#000002', '#000001', '#000003'])
    expect(moveColor(d, 0, 5)).toBe(d)
  })
})

it('slugifies titles', () => {
  expect(slugify('Compass Rose')).toBe('compass-rose')
  expect(slugify('  Café & Crêpes! ')).toBe('cafe-crepes')
  expect(slugify('!!!')).toBe('untitled')
})
