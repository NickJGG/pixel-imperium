import { describe, expect, it } from 'vitest'
import { hashString, mulberry32 } from './random.ts'

describe('mulberry32', () => {
  it('is deterministic per seed and stays in [0, 1)', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    for (let i = 0; i < 100; i++) {
      const x = a()
      expect(x).toBe(b())
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
    expect(mulberry32(8)()).not.toBe(mulberry32(7)())
  })
})

describe('hashString', () => {
  it('matches the 31-multiplier hash', () => {
    expect(hashString('')).toBe(0)
    expect(hashString('a')).toBe(97)
    expect(hashString('ab')).toBe(97 * 31 + 98)
  })
})
