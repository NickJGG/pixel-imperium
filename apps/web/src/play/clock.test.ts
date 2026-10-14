import { describe, expect, it } from 'vitest'
import { formatClock } from './clock.ts'

describe('formatClock', () => {
  it('reads m:ss under an hour, rounding down to the second', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(999)).toBe('0:00')
    expect(formatClock(4_000)).toBe('0:04')
    expect(formatClock(252_500)).toBe('4:12')
    expect(formatClock(3_599_999)).toBe('59:59')
  })

  it('reads h:mm:ss from an hour up', () => {
    expect(formatClock(3_600_000)).toBe('1:00:00')
    expect(formatClock(3_600_000 + 65_000)).toBe('1:01:05')
    expect(formatClock(11 * 3_600_000 + 59 * 60_000)).toBe('11:59:00')
  })
})
