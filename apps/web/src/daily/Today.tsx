import { Link } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { DailySummary, DailyYear } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { type DailyClock, GRACE_MS, dailyClock, dailyId, formatLeft, startOf } from './clock.ts'
import { DayFace } from './MonthCalendar.tsx'
import { dayParams, summaryOf } from './month.ts'
import { useNow } from './useNow.ts'
import styles from './Daily.module.css'

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })

export const weekdayOf = (date: string) => weekday.format(startOf(date))

/** The Daily's clock, ticking each minute. */
export const useDailyClock = (storage: ProgressStorage): DailyClock => dailyClock(useNow(), storage)

/** "10×10 · Monday · easy". */
export const metaOf = (summary: DailySummary) =>
  [`${summary.width}×${summary.height}`, weekdayOf(summary.date), summary.tier].filter(Boolean).join(' · ')

/** Time left to start today's Daily, gold in the last hour. */
export function StartChip({ clock }: { clock: DailyClock }) {
  return (
    <p className={styles.clock} data-late={clock.startLeft <= GRACE_MS || undefined} role="timer">
      Start by midnight · {formatLeft(clock.startLeft)}
    </p>
  )
}

/** Yesterday's Daily while its grace hour lasts: a way back into it before 01:00. */
export function FinishCard({ clock, data, storage }: { clock: DailyClock; data: DailyYear | null; storage: ProgressStorage }) {
  const date = clock.finishing
  if (!date) return null
  const summary = summaryOf(data, date)
  const id = dailyId(date)
  const percent = summary
    ? progressPercent(storage.loadProgress(id, summary.width * summary.height) ?? [], summary.filledCount, false)
    : null
  return (
    <Link to="/daily/$year/$month/$day" params={dayParams(date)} className={styles.finish}>
      <DayFace date={date} status="finishing" summary={summary} storage={storage} door />
      <div>
        <b>Finish {weekdayOf(date)}’s</b>
        <small>{[summary?.title, percent !== null && `${percent}% done`].filter(Boolean).join(' · ')}</small>
      </div>
      <span className={styles.clock} data-late role="timer">
        by 01:00 · {formatLeft(clock.finishLeft)}
      </span>
    </Link>
  )
}
