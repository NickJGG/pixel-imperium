import { describe, expect, it } from 'vitest'
import type { DailyClock } from './clock.ts'
import { datesOf, dayStatus, leadOf, tallyOf, weeksOf } from './month.ts'

const clock = (today: string, finishing: string | null = null): DailyClock => ({
  today,
  startLeft: 0,
  finishing,
  finishLeft: 0,
})

describe('datesOf', () => {
  it('lists every date of the month', () => {
    expect(datesOf(2026, 10)).toHaveLength(31)
    expect(datesOf(2028, 2).at(-1)).toBe('2028-02-29')
    expect(datesOf(2026, 10)[0]).toBe('2026-10-01')
  })
})

describe('weeksOf', () => {
  it('splits the month into Monday-first weeks', () => {
    // 1 October 2026 is a Thursday.
    expect(leadOf(2026, 10)).toBe(3)
    const weeks = weeksOf(2026, 10)
    expect(weeks.map(w => w.length)).toEqual([4, 7, 7, 7, 6])
    expect(weeks[1]![0]).toBe('2026-10-05')
  })
})

describe('dayStatus', () => {
  const launch = '2026-10-01'

  it('reads each date against today', () => {
    const now = clock('2026-10-12')
    expect(dayStatus('2026-09-30', launch, now, false)).toBe('before')
    expect(dayStatus('2026-10-11', launch, now, false)).toBe('missed')
    expect(dayStatus('2026-10-11', launch, now, true)).toBe('solved')
    expect(dayStatus('2026-10-12', launch, now, false)).toBe('today')
    expect(dayStatus('2026-10-13', launch, now, false)).toBe('future')
  })

  it("keeps yesterday's Daily open through its grace", () => {
    expect(dayStatus('2026-10-11', launch, clock('2026-10-12', '2026-10-11'), false)).toBe('finishing')
  })
})

describe('tallyOf', () => {
  const solved = new Set(['2026-10-01', '2026-10-05'])
  const isSolved = (d: string) => solved.has(d)

  it('counts the dates from launch on', () => {
    expect(tallyOf(2026, 10, '2026-10-01', '2026-10-12', isSolved)).toMatchObject({ dim: false, solved: 2, sofar: 12 })
    expect(tallyOf(2026, 10, '2026-10-10', '2026-10-12', isSolved).dates).toHaveLength(22)
  })

  it('dims a month still to come or before launch', () => {
    expect(tallyOf(2026, 11, '2026-10-01', '2026-10-12', isSolved).dim).toBe(true)
    expect(tallyOf(2026, 9, '2026-10-01', '2026-10-12', isSolved).dim).toBe(true)
  })
})
