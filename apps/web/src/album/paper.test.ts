import { describe, expect, it } from 'vitest'
import { derivePaper, paperFor } from './paper.ts'

const lightness = (hex: string) => {
  const n = parseInt(hex.slice(1), 16)
  return (Math.max(n >> 16, (n >> 8) & 255, n & 255) + Math.min(n >> 16, (n >> 8) & 255, n & 255)) / 510
}

describe('derivePaper', () => {
  it('gives grey for a pick without a hue', () => {
    const grey = derivePaper('#808080')
    expect(derivePaper('#000000')).toEqual(grey)
    expect(derivePaper('#ffffff')).toEqual(grey)
    for (const hex of Object.values(grey)) expect(hex.slice(1, 3)).toBe(hex.slice(3, 5))
  })

  it('keeps a yellow pick yellow: a dark Night page, a pale Day one and a vivid tab', () => {
    const { night, day, tab } = derivePaper('#ffd800')
    expect(lightness(night)).toBeLessThan(0.2)
    expect(lightness(day)).toBeGreaterThan(0.8)
    expect(tab).toMatch(/^#[0-9a-f]{6}$/)
    for (const hex of [night, day, tab]) {
      const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)].map(c => parseInt(c, 16)) as [number, number, number]
      expect(r).toBeGreaterThan(b)
      expect(g).toBeGreaterThan(b)
    }
  })

  it('takes only the hue, so a dark and a light pick of one hue match', () => {
    expect(derivePaper('#3a1010')).toEqual(derivePaper('#ff8080'))
  })
})

describe('paperFor', () => {
  it('names a named paper', () => {
    expect(paperFor('coast')).toEqual({ '--paper': 'var(--p-coast)', '--tab': 'var(--t-coast)' })
  })

  it('mixes a hex paper by the theme', () => {
    const { night, day, tab } = derivePaper('#2a7fd4')
    expect(paperFor('#2a7fd4')).toEqual({ '--paper': `color-mix(in srgb, ${day} calc(var(--day) * 100%), ${night})`, '--tab': tab })
  })
})
