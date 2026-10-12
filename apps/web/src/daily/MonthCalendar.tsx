import { Link } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'
import type { DailySummary, DailyYear } from '@pixel-imperium/protocol'
import { Slot } from '../album/Slot.tsx'
import { Sticker, StickerBack, tiltOf } from '../album/Sticker.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { Ghost } from '../skeleton/Skeleton.tsx'
import { type DailyClock, dailyId, startOf } from './clock.ts'
import { WEEKDAYS, type DayStatus, datesOf, dayParams, dayStatus, leadOf, playable, summaryOf } from './month.ts'
import styles from './Daily.module.css'

const longDate = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })

/**
 * A Month as a page of date slots under its weekday headers, each header carrying its sizes: a sticker for every
 * Daily solved, a dashed hole for one missed, today's on its backing, the days to come faint. Today's slot, and
 * yesterday's while its grace lasts, open the Daily.
 */
export function MonthCalendar({
  year,
  month,
  data,
  clock,
  storage,
  padDefault = false,
}: {
  year: number
  /** 1–12. */
  month: number
  data: DailyYear
  clock: DailyClock
  storage: ProgressStorage
  /** Today's slot, solved or not, holds the pad's default. */
  padDefault?: boolean
}) {
  return (
    <MonthGrid year={year} month={month}>
      {date => {
        const status = dayStatus(date, data.launch, clock, storage.loadSolved(dailyId(date)) !== null)
        return (
          <DayCell
            date={date}
            status={status}
            summary={summaryOf(data, date)}
            storage={storage}
            open={playable(status) || date === clock.today}
            padDefault={padDefault && date === clock.today}
          />
        )
      }}
    </MonthGrid>
  )
}

/** The Month's weekday headers and its dates laid out under them, each date's slot from `children`. */
export function MonthGrid({
  year,
  month,
  children,
}: {
  year: number
  month: number
  children: (date: string) => ReactNode
}) {
  const lead = leadOf(year, month)
  const dates = datesOf(year, month)
  return (
    <div
      className={styles.calendar}
      style={{ '--weeks': Math.ceil((lead + dates.length) / 7) } as CSSProperties}
    >
      <div className={styles.weekdays} aria-hidden="true">
        {WEEKDAYS.map(w => (
          <span key={w.name}>
            {w.name}
            <small>{w.sizes}</small>
          </span>
        ))}
      </div>
      <ol className={styles.days}>
        {dates.map((date, i) => (
          <li key={date} style={i === 0 ? { gridColumnStart: lead + 1 } : undefined}>
            {children(date)}
          </li>
        ))}
      </ol>
    </div>
  )
}

/** A `MonthGrid` while it loads: a ghost slot per date. */
export function MonthGridSkeleton({ year, month }: { year: number; month: number }) {
  return (
    <MonthGrid year={year} month={month}>
      {() => (
        <span className={styles.dayLink}>
          <Ghost style={{ width: '100%', aspectRatio: 1 }} />
        </span>
      )}
    </MonthGrid>
  )
}

function DayCell({
  date,
  status,
  summary,
  storage,
  open,
  padDefault,
}: {
  date: string
  status: DayStatus
  summary: DailySummary | undefined
  storage: ProgressStorage
  /** Opens its Daily: while it can be played, and today's once solved, to see it again. */
  open: boolean
  padDefault: boolean
}) {
  if (status === 'before') return null
  const day = Number(date.slice(8))
  const face = <DayFace date={date} status={status} summary={summary} storage={storage} />
  const label = `${longDate.format(startOf(date))}: ${labelOf(status, summary)}`
  return open ? (
    <Link
      to="/daily/$year/$month/$day"
      params={dayParams(date)}
      className={styles.dayLink}
      data-pad-default={padDefault || undefined}
      aria-label={label}
    >
      {face}
      <small className={styles.date}>{day}</small>
    </Link>
  ) : (
    <span className={styles.dayLink} role="img" aria-label={label}>
      {face}
      <small className={styles.date}>{day}</small>
    </span>
  )
}

function labelOf(status: DayStatus, summary: DailySummary | undefined): string {
  switch (status) {
    case 'solved':
      return summary ? `${summary.title}, solved` : 'solved'
    case 'today':
      return "today's Daily"
    case 'finishing':
      return 'still to finish'
    case 'missed':
      return 'missed'
    default:
      return 'still to come'
  }
}

/** What fills a date's slot: its sticker once solved, else the backing, a hole, or a faint square. */
export function DayFace({
  date,
  status,
  summary,
  storage,
}: {
  date: string
  status: DayStatus
  summary: DailySummary | undefined
  storage: ProgressStorage
}) {
  const id = dailyId(date)
  if (status === 'solved' && summary) {
    const { width, height, title } = summary
    return (
      <Slot number={0} width={width} height={height}>
        <Sticker
          title={title}
          width={width}
          height={height}
          palette={storage.loadPalette(id, width * height) ?? Array<null>(width * height).fill(null)}
          foil={storage.loadFoil(id)}
          unverified={storage.loadSolved(id) === 'unverified'}
          tilt={tiltOf(id)}
        />
      </Slot>
    )
  }
  if (playable(status) || status === 'solved') {
    return (
      <span className={styles.backing} data-due={playable(status) || undefined}>
        <StickerBack width={1} height={1} tilt={tiltOf(id)} />
      </span>
    )
  }
  return <span className={styles.hole} data-status={status} />
}
