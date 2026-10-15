import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type Draft, type SeedPuzzle, formatSeed, fromSeed, paletteLetters, parsePaste, toSeed } from './seed.ts'

const coastText = readFileSync(
  join(import.meta.dirname, '../../../apps/server/data/campaigns/imperium/coast.json'),
  'utf8',
).replaceAll('\r\n', '\n')
const coast = JSON.parse(coastText) as SeedPuzzle[]

const K = '#000000'
const W = '#ffffff'

/** A Draft from rows of `k`, `w` and `.`. */
const draftOf = (...rows: string[]): Draft => fromSeed({ id: 't', title: 'T', palette: { k: K, w: W }, rows })

/** The picture as hexes, so letter choices don't matter. */
const pixels = (seed: SeedPuzzle) =>
  seed.rows.map(row => [...row].map(ch => (ch === '.' ? null : seed.palette[ch]!.toLowerCase())))

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
    expect(toSeed({ ...draftOf('kw', '..'), colors: [W, K] }).palette).toEqual({ w: W, k: K })
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
