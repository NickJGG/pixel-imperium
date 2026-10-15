import type { DailyYear } from '@pixel-imperium/protocol'
import { dailyYear } from '../content.ts'

let last: DailyYear | null = null

/** Loads a Year of Dailies and keeps it, so a skeleton can lay out its Months before the next load lands. */
export async function loadDailyYear(year: number): Promise<DailyYear | null> {
  const data = await dailyYear(year)
  if (data) last = data
  return data
}

/** The Year last loaded, if any, without fetching: for a skeleton. */
export const currentDailyYear = (): DailyYear | null => last
