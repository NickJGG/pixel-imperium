import { Link } from '@tanstack/react-router'
import { type CSSProperties, useMemo } from 'react'
import type { DailyYear, Profile } from '@pixel-imperium/protocol'
import { CountPill } from '../album/CountPill.tsx'
import { type Season, paperFor } from '../album/paper.ts'
import { World } from '../campaign/worlds/Worlds.tsx'
import { doorSlot } from '../campaign/worlds/names.ts'
import { dailyId, solveTime, solveTimes } from '../daily/clock.ts'
import { DayFace, MonthCalendar } from '../daily/MonthCalendar.tsx'
import { MONTH_NAMES, dayParams, dayStatus, isSolvedWith, monthParams, summaryOf, tallyOf, weeksOf } from '../daily/month.ts'
import { FinishCard, StartChip, metaOf, useDailyClock } from '../daily/Today.tsx'
import { usePrefetch } from '../play/prefetch.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { streakOf } from '../profile/activity.ts'
import styles from './Home.module.css'

/**
 * Home's way into the Daily, mirroring the Campaign column: this Month's count, a bar segment per week, today's
 * Daily with the time left to start it, and the Month's calendar beside them. While yesterday's grace lasts, a card
 * offers to finish it.
 */
export function DailyColumn({
  data,
  profile,
  storage,
  season,
  start,
  style,
}: {
  /** This Year's Dailies. */
  data: DailyYear
  /** The signed-in player's, for the Streak; this device's solves count without it. */
  profile: Profile | null
  storage: ProgressStorage
  season: Season
  start: boolean
  style: CSSProperties
}) {
  const clock = useDailyClock(storage)
  const { today } = clock
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const name = MONTH_NAMES[month - 1]!
  const isSolved = isSolvedWith(storage)
  const tally = tallyOf(year, month, data.launch, today, isSolved)
  const todays = summaryOf(data, today)
  const solvedToday = isSolved(today)
  usePrefetch(todays && dailyId(today))

  const streak = useMemo(() => {
    const times = profile
      ? solveTimes([...profile.campaigns, ...profile.years])
      : storage.puzzleIds().flatMap(id => {
          const at = storage.loadSolvedAt(id)
          return at ? [solveTime(id, at)] : []
        })
    return streakOf(times, new Date()).current
  }, [profile, storage, today])

  return (
    <World paper={season} labelledBy="home-daily" style={style} start={start} pair>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>Daily · {streak > 0 ? `${streak}-day streak` : `${name} ${year}`}</p>
          <h2 id="home-daily" className={styles.hero}>
            Daily
          </h2>
          <CountPill conquered={tally.solved === tally.dates.length} className={styles.count}>
            {tally.solved} / {tally.dates.length}
          </CountPill>
          <div className={styles.bar} aria-hidden="true">
            {weeksOf(year, month).map(week => {
              const dates = week.filter(d => d >= data.launch)
              const share = dates.length === 0 ? 0 : (dates.filter(isSolved).length / dates.length) * 100
              return <i key={week[0]} style={{ ...paperFor(season), '--f': `${share}%` } as CSSProperties} />
            })}
          </div>
          <p className={styles.sub}>
            {name} · {tally.solved}/{tally.sofar} so far
          </p>
          {todays && (
            <div className={styles.next}>
              <Link
                to="/daily/$year/$month/$day"
                params={dayParams(today)}
                className={styles.nextSlot}
                {...doorSlot(dailyId(today))}
                tabIndex={-1}
                aria-hidden="true"
              >
                <DayFace
                  date={today}
                  status={dayStatus(today, data.launch, clock, solvedToday)}
                  summary={todays}
                  storage={storage}
                />
              </Link>
              <div className={styles.nextText}>
                <p className={styles.kicker}>{solvedToday ? 'Solved today' : 'Today'}</p>
                <p className={styles.nextName}>{todays.title}</p>
                <p className={styles.sub}>{metaOf(todays)}</p>
              </div>
            </div>
          )}
          {todays && !solvedToday && <StartChip clock={clock} />}
          <FinishCard clock={clock} data={data} storage={storage} />
          <div className={styles.actions}>
            {todays && !solvedToday && (
              <Link to="/daily/$year/$month/$day" params={dayParams(today)} data-variant="primary" data-pad-default>
                Play today’s
              </Link>
            )}
            <Link
              to="/daily/$year/$month"
              params={monthParams(today)}
              data-variant="paper"
              data-pad-default={!todays || solvedToday || undefined}
            >
              Open {name}
            </Link>
          </div>
        </div>
        <div className={styles.picture}>
          <MonthCalendar year={year} month={month} data={data} clock={clock} storage={storage} />
        </div>
      </div>
    </World>
  )
}
