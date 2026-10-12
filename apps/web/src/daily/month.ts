/** A Month of Dailies as a calendar page: its dates by week, and what each date's cell shows. */
import type { DailySummary, DailyYear } from '@pixel-imperium/protocol'
import { type DailyClock, dailyId } from './clock.ts'

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

/** Monday first; each weekday's sizes, as the server's weekday bands set them. */
export const WEEKDAYS = [
  { name: 'Mon', sizes: '5–10' },
  { name: 'Tue', sizes: '10' },
  { name: 'Wed', sizes: '10–15' },
  { name: 'Thu', sizes: '15' },
  { name: 'Fri', sizes: '15–20' },
  { name: 'Sat', sizes: '20' },
  { name: 'Sun', sizes: '20–25' },
] as const

export const mm = (month: number) => String(month).padStart(2, '0')

/** Every date in `month` (1–12) of `year`, as `YYYY-MM-DD`. */
export function datesOf(year: number, month: number): string[] {
  const days = new Date(year, month, 0).getDate()
  return Array.from({ length: days }, (_, i) => `${year}-${mm(month)}-${String(i + 1).padStart(2, '0')}`)
}

/** Blank cells before the 1st, Monday first. */
export const leadOf = (year: number, month: number) => (new Date(year, month - 1, 1).getDay() + 6) % 7

/** The month's dates in Monday-to-Sunday weeks; the first and last are short. */
export function weeksOf(year: number, month: number): string[][] {
  const lead = leadOf(year, month)
  const weeks: string[][] = []
  datesOf(year, month).forEach((date, i) => {
    const week = (weeks[Math.floor((i + lead) / 7)] ??= [])
    week.push(date)
  })
  return weeks
}

export type DayStatus = 'before' | 'future' | 'today' | 'finishing' | 'solved' | 'missed'

export function dayStatus(date: string, launch: string, clock: DailyClock, solved: boolean): DayStatus {
  if (date < launch) return 'before'
  if (solved) return 'solved'
  if (date === clock.today) return 'today'
  if (date === clock.finishing) return 'finishing'
  return date > clock.today ? 'future' : 'missed'
}

/** Whether a date's cell opens its Daily: only while it can still be played. */
export const playable = (status: DayStatus) => status === 'today' || status === 'finishing'

/**
 * A Month as the album sees it: dim while it's still to come or wholly before launch; otherwise its dates from
 * launch on, and how many of them are solved.
 */
export interface MonthTally {
  dim: boolean
  dates: string[]
  solved: number
  /** Dates up to today. */
  sofar: number
}

export function tallyOf(
  year: number,
  month: number,
  launch: string,
  today: string,
  isSolved: (date: string) => boolean,
): MonthTally {
  const dates = datesOf(year, month).filter(d => d >= launch)
  const dim = dates.length === 0 || dates[0]! > today
  return {
    dim,
    dates,
    solved: dates.filter(isSolved).length,
    sofar: dates.filter(d => d <= today).length,
  }
}

export const isSolvedWith = (storage: { loadSolved(id: string): unknown }) => (date: string) =>
  storage.loadSolved(dailyId(date)) !== null

/** The Daily for `date` in a Year's data, if the server has listed it. */
export const summaryOf = (year: DailyYear | null, date: string): DailySummary | undefined =>
  year?.months[Number(date.slice(5, 7)) - 1]?.find(d => d.date === date)

/** `/daily/<year>/<mm>` params for the Month holding `date`. */
export const monthParams = (date: string) => ({ year: date.slice(0, 4), month: date.slice(5, 7) })

/** `/daily/<year>/<mm>/<dd>` params for `date`. */
export const dayParams = (date: string) => ({ ...monthParams(date), day: date.slice(8, 10) })
