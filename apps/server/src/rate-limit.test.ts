import { describe, expect, it } from 'vitest'
import { rateLimiter } from './rate-limit.ts'

describe('rateLimiter', () => {
  it('allows the limit per key in each window', () => {
    let t = 0
    const allowed = rateLimiter(2, 1000, () => t)
    expect([allowed('a'), allowed('a'), allowed('a'), allowed('b')]).toEqual([true, true, false, true])
    t = 1000
    expect(allowed('a')).toBe(true)
  })
})
