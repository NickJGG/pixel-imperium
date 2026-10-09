import { describe, expect, it } from 'vitest'
import { CALENDAR_WEEKS, calendarOf, dayKey, relativeDate, streakOf, weekOf } from './activity.ts'

const at = (day: number, hour = 12, month = 9) => new Date(2026, month, day, hour)
/** Wednesday, Oct 7 2026. */
const now = at(7, 15)

describe('streakOf', () => {
  it('counts back from today', () => {
    expect(streakOf([at(5), at(6), at(7), at(7, 9)], now)).toEqual({ current: 3, best: 3 })
  })

  it('keeps the streak alive through yesterday while today is still open', () => {
    expect(streakOf([at(5), at(6)], now).current).toBe(2)
  })

  it('breaks after a missed day but remembers the best', () => {
    expect(streakOf([at(1), at(2), at(3), at(4), at(5), at(10, 12, 8)], at(9))).toEqual({ current: 0, best: 5 })
  })

  it('is empty without solves', () => {
    expect(streakOf([], now)).toEqual({ current: 0, best: 0 })
  })

  it('runs across a month end', () => {
    expect(streakOf([at(30, 12, 8), at(1)], at(1, 20)).best).toBe(2)
  })
})

describe('calendarOf', () => {
  const days = calendarOf(
    [
      { at: at(7, 9), foil: false },
      { at: at(6), foil: false },
      { at: at(6, 13), foil: true },
      ...[1, 2, 3, 4].map(() => ({ at: at(5), foil: false })),
    ],
    now,
  )

  it('spans whole weeks, Sunday first, ending with this one', () => {
    expect(days).toHaveLength(CALENDAR_WEEKS * 7)
    expect(new Date(`${days[0]!.key}T00:00`).getDay()).toBe(0)
    expect(days.at(-1)!.key).toBe('2026-10-10')
    expect(days.filter(d => d.future).map(d => d.key)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10'])
  })

  it('levels days by stickers and marks foil', () => {
    const byKey = new Map(days.map(d => [d.key, d]))
    expect(byKey.get('2026-10-07')).toMatchObject({ level: 1, foil: false })
    expect(byKey.get('2026-10-06')).toMatchObject({ level: 2, foil: true })
    expect(byKey.get('2026-10-05')).toMatchObject({ level: 3, foil: false })
    expect(byKey.get('2026-10-04')).toMatchObject({ level: 0 })
  })
})

describe('weekOf', () => {
  it('spans the seven days up to today, oldest first', () => {
    const week = weekOf([], now)
    expect(week.map(d => d.key)).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
    ])
    expect(week.every(d => d.count === 0 && d.level === 0)).toBe(true)
  })

  it('counts and levels each day, ignoring days outside the week', () => {
    const week = weekOf([at(7, 9), at(6), at(6, 13), ...[1, 2, 3, 4].map(() => at(2)), at(30, 12, 8), at(8)], now)
    expect(week.map(d => d.count)).toEqual([0, 4, 0, 0, 0, 2, 1])
    expect(week.map(d => d.level)).toEqual([0, 3, 0, 0, 0, 2, 1])
  })
})

describe('relativeDate', () => {
  it('reads today in minutes and hours', () => {
    expect(relativeDate(new Date(now.getTime() - 20_000), now)).toBe('just now')
    expect(relativeDate(new Date(now.getTime() - 5 * 60_000), now)).toBe('5m ago')
    expect(relativeDate(at(7, 13), now)).toBe('2h ago')
  })

  it('says yesterday by calendar day, not 24 hours', () => {
    expect(relativeDate(at(6, 23), at(7, 1))).toBe('yesterday')
    expect(relativeDate(at(6, 1), now)).toBe('yesterday')
  })

  it('dates anything older', () => {
    expect(relativeDate(at(4), now)).not.toMatch(/ago|yesterday|2026/)
    expect(relativeDate(new Date(2025, 9, 4), now)).toMatch(/2025/)
  })
})

describe('dayKey', () => {
  it('uses the local day', () => {
    expect(dayKey(at(7, 23))).toBe('2026-10-07')
  })
})
