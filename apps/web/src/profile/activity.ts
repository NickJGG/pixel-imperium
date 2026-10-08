/** Dates in a Profile, all read in the viewer's own timezone. */

/** The local calendar day of `date`, e.g. `2026-10-07`. */
export function dayKey(date: Date): string {
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${d}`
}

/** Local midnight `days` days after `date`'s; DST-safe, unlike adding 24 hours. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export interface Streak {
  /** Consecutive days with a solve up to today, or up to yesterday while today is still open. */
  current: number
  best: number
}

export function streakOf(times: readonly Date[], now: Date): Streak {
  const days = new Set(times.map(dayKey))
  let best = 0
  for (const key of days) {
    const [y, m, d] = key.split('-').map(Number) as [number, number, number]
    const day = new Date(y, m - 1, d)
    if (days.has(dayKey(addDays(day, -1)))) continue
    let run = 1
    while (days.has(dayKey(addDays(day, run)))) run++
    best = Math.max(best, run)
  }
  let from = days.has(dayKey(now)) ? now : addDays(now, -1)
  let current = 0
  while (days.has(dayKey(from))) {
    current++
    from = addDays(from, -1)
  }
  return { current, best }
}

export const CALENDAR_WEEKS = 26

export interface CalendarDay {
  key: string
  count: number
  /** 0 for none, then 1 sticker, 2–3, and 4 or more. */
  level: 0 | 1 | 2 | 3
  foil: boolean
  /** After today; drawn blank. */
  future: boolean
}

/**
 * `CALENDAR_WEEKS` weeks of days ending with the week holding `now`, Sunday first, in column order (a week's seven
 * days, then the next week's).
 */
export function calendarOf(solves: readonly { at: Date; foil: boolean }[], now: Date): CalendarDay[] {
  const counts = new Map<string, { n: number; foil: boolean }>()
  for (const { at, foil } of solves) {
    const day = counts.get(dayKey(at)) ?? { n: 0, foil: false }
    counts.set(dayKey(at), { n: day.n + 1, foil: day.foil || foil })
  }
  const today = dayKey(now)
  const start = addDays(now, -now.getDay() - 7 * (CALENDAR_WEEKS - 1))
  return Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => {
    const key = dayKey(addDays(start, i))
    const day = counts.get(key)
    const n = day?.n ?? 0
    return { key, count: n, level: n === 0 ? 0 : n === 1 ? 1 : n < 4 ? 2 : 3, foil: day?.foil ?? false, future: key > today }
  })
}

const monthDay = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' })
const monthDayYear = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/** "Oct 4", with the year only when it isn't this one. */
export function shortDate(date: Date, now: Date): string {
  return (date.getFullYear() === now.getFullYear() ? monthDay : monthDayYear).format(date)
}

/** "just now", "5m ago", "2h ago" today, then "yesterday", then a `shortDate`. */
export function relativeDate(date: Date, now: Date): string {
  const ms = now.getTime() - date.getTime()
  if (dayKey(date) === dayKey(now)) {
    if (ms < 60_000) return 'just now'
    if (ms < 60 * 60_000) return `${Math.floor(ms / 60_000)}m ago`
    return `${Math.floor(ms / (60 * 60_000))}h ago`
  }
  if (dayKey(date) === dayKey(addDays(now, -1))) return 'yesterday'
  return shortDate(date, now)
}
