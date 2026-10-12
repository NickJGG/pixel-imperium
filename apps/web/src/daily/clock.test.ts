import { describe, expect, it } from 'vitest'
import { type DailyRecords, dailyClock, dailyState, finishLeft, formatLeft, solveTime, startedOn } from './clock.ts'

const at = (day: number, hour = 12, minute = 0) => new Date(2026, 9, day, hour, minute)

const records = (saved: Record<string, Date>, solved: string[] = []): DailyRecords => ({
  loadUpdatedAt: id => saved[id]?.toISOString() ?? null,
  loadSolved: id => (solved.includes(id) ? 'local' : null),
})

describe('dailyClock', () => {
  it('counts down to midnight', () => {
    const clock = dailyClock(at(12, 21, 48), records({}))
    expect(clock).toEqual({ today: '2026-10-12', startLeft: (2 * 60 + 12) * 60_000, finishing: null, finishLeft: 0 })
  })

  it("offers yesterday's Daily through the grace hour when it was started on its date", () => {
    const saved = records({ 'daily:2026-10-12': at(12, 23, 50) })
    expect(dailyClock(at(13, 0, 20), saved)).toMatchObject({ finishing: '2026-10-12', finishLeft: 40 * 60_000 })
    expect(dailyClock(at(13, 1, 0), saved).finishing).toBeNull()
  })

  it('keeps the grace when the grid was saved again after midnight', () => {
    expect(dailyClock(at(13, 0, 30), records({ 'daily:2026-10-12': at(13, 0, 25) })).finishing).toBe('2026-10-12')
  })

  it('offers no grace for an unstarted or already solved Daily', () => {
    expect(dailyClock(at(13, 0, 20), records({})).finishing).toBeNull()
    const solved = records({ 'daily:2026-10-12': at(12, 9) }, ['daily:2026-10-12'])
    expect(dailyClock(at(13, 0, 20), solved).finishing).toBeNull()
    expect(dailyClock(at(13, 0, 20), records({ 'daily:2026-10-12': at(11, 9) })).finishing).toBeNull()
  })
})

describe('dailyState', () => {
  const clock = dailyClock(at(13, 0, 20), records({ 'daily:2026-10-12': at(12, 22) }))
  it.each([
    ['2026-10-13', 'today'],
    ['2026-10-12', 'finishing'],
    ['2026-10-11', 'gone'],
    ['2026-10-14', 'early'],
  ])('%s is %s', (date, state) => {
    expect(dailyState(date, clock)).toBe(state)
  })
})

describe('startedOn', () => {
  it('needs a save from the date through its grace', () => {
    expect(startedOn('2026-10-12', null)).toBe(false)
    expect(startedOn('2026-10-12', at(12, 0, 0).toISOString())).toBe(true)
    expect(startedOn('2026-10-12', at(13, 0, 59).toISOString())).toBe(true)
    expect(startedOn('2026-10-12', at(13, 1, 0).toISOString())).toBe(false)
    expect(startedOn('2026-10-12', at(11, 23, 59).toISOString())).toBe(false)
  })
})

describe('finishLeft', () => {
  it('runs to 01:00 the next day', () => {
    expect(finishLeft('2026-10-12', at(12, 23, 0))).toBe(2 * 60 * 60_000)
    expect(finishLeft('2026-10-12', at(13, 1, 30))).toBeLessThan(0)
  })
})

describe('formatLeft', () => {
  it.each([
    [(2 * 60 + 12) * 60_000, '2h 12m'],
    [45 * 60_000, '45m'],
    [30_000, '1m'],
    [-5, '0m'],
    [60 * 60_000, '1h 0m'],
  ])('%d ms is %s', (ms, text) => {
    expect(formatLeft(ms)).toBe(text)
  })
})

describe('solveTime', () => {
  it("counts a Daily on its own date, whatever time it was solved", () => {
    expect(solveTime('daily:2026-10-12', '2026-10-13T04:30:00Z')).toEqual(at(12))
  })

  it('keeps a campaign solve at its time', () => {
    expect(solveTime('rome-1', '2026-10-13T04:30:00Z')).toEqual(new Date('2026-10-13T04:30:00Z'))
  })
})
