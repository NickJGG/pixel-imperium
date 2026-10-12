/**
 * The Daily's day, on the Player's own clock: a Daily can be started only on its date, and one with progress
 * saved on its date can be finished until 01:00 the next day.
 */
import { dayKey } from '../profile/activity.ts'

const PREFIX = 'daily:'
export const dailyId = (date: string) => `${PREFIX}${date}`
export const dailyDateOf = (id: string) => (id.startsWith(PREFIX) ? id.slice(PREFIX.length) : null)

const MINUTE_MS = 60_000
export const GRACE_MS = 60 * MINUTE_MS

/** Local midnight at the start of `date`, a `YYYY-MM-DD`. */
export function startOf(date: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

const nextMidnight = (date: string) => {
  const start = startOf(date)
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
}

/** Whether the grid was saved on `date`, or in the grace after it: the evidence that it was started in time. */
export function startedOn(date: string, updatedAt: string | null): boolean {
  if (updatedAt === null) return false
  const t = new Date(updatedAt).getTime()
  const end = nextMidnight(date).getTime() + GRACE_MS
  return t >= startOf(date).getTime() && t < end
}

export interface DailyClock {
  today: string
  /** Until midnight, the last moment to start today's Daily. */
  startLeft: number
  /** Yesterday's date, while its grace hour lasts and it was started on its date but isn't solved. */
  finishing: string | null
  /** Until 01:00, the last moment to finish `finishing`; 0 without it. */
  finishLeft: number
}

export interface DailyRecords {
  loadUpdatedAt(puzzleId: string): string | null
  loadSolved(puzzleId: string): unknown
}

export function dailyClock(now: Date, records: DailyRecords): DailyClock {
  const today = dayKey(now)
  const startLeft = nextMidnight(today).getTime() - now.getTime()
  const yesterday = dayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))
  const graceLeft = startOf(today).getTime() + GRACE_MS - now.getTime()
  const id = dailyId(yesterday)
  const open = graceLeft > 0 && records.loadSolved(id) === null && startedOn(yesterday, records.loadUpdatedAt(id))
  const finishing = open ? yesterday : null
  return { today, startLeft, finishing, finishLeft: finishing ? graceLeft : 0 }
}

export type DailyState = 'today' | 'finishing' | 'gone' | 'early'

/** Whether the Daily for `date` can be played at `now`: today's, yesterday's in its grace, or not at all. */
export function dailyState(date: string, clock: DailyClock): DailyState {
  if (date === clock.today) return 'today'
  if (date === clock.finishing) return 'finishing'
  return date > clock.today ? 'early' : 'gone'
}

/** Until 01:00 after `date`, the last moment to finish its Daily; negative once it's passed. */
export const finishLeft = (date: string, now: Date) => nextMidnight(date).getTime() + GRACE_MS - now.getTime()

/** "2h 12m", "45m"; minutes round up, so it reads "1m" until the very end. */
export function formatLeft(ms: number): string {
  const minutes = Math.max(0, Math.ceil(ms / MINUTE_MS))
  const h = Math.floor(minutes / 60)
  return h > 0 ? `${h}h ${minutes % 60}m` : `${minutes}m`
}

/** When a solve counts: a Daily's on its own date, at local noon, whatever the clock said when it was solved. */
export function solveTime(puzzleId: string, at: string): Date {
  const date = dailyDateOf(puzzleId)
  return date ? new Date(`${date}T12:00`) : new Date(at)
}

/** Every solve time in `albums`, Campaigns and Years alike, by `solveTime`. */
export const solveTimes = (albums: readonly { solvedAt: Record<string, string> }[]): Date[] =>
  albums.flatMap(a => Object.entries(a.solvedAt).map(([id, at]) => solveTime(id, at)))
