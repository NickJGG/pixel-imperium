import { Link, useNavigate } from '@tanstack/react-router'
import { useRef } from 'react'
import type { DailyYear } from '@pixel-imperium/protocol'
import { CountPill } from '../album/CountPill.tsx'
import { seasonOf } from '../album/paper.ts'
import { useAccount } from '../account.ts'
import { Backdrop, MonthSpine, World, Worlds, monthMorphName, usePhone, useSpineReach, useStep } from '../campaign/worlds/Worlds.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { type DailyClock, startOf } from './clock.ts'
import { DayFace, MonthCalendar } from './MonthCalendar.tsx'
import { MONTH_NAMES, type MonthTally, dayParams, isSolvedWith, mm, monthParams, summaryOf, tallyOf } from './month.ts'
import { FinishCard, StartChip, metaOf, useDailyClock } from './Today.tsx'
import styles from './Daily.module.css'
import provinceStyles from '../campaign/Province.module.css'
import campaignStyles from '../campaign/Campaign.module.css'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

const fullDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * A Year of Dailies, built like a Campaign's album: one Month's page at a time, every other Month a spine beside
 * it; on a phone, a carousel of whole pages. Months still to come, and those before the Daily began, are in the fog.
 * Moving to another Month replaces this page in history, so Back leaves the Year in one step.
 */
export function MonthPage(props: { data: DailyYear; month: number }) {
  const { generation } = useAccount()
  return <Year key={`${generation}:${props.data.year}`} {...props} />
}

function Year({ data, month }: { data: DailyYear; month: number }) {
  const { storage } = useAccount()
  const navigate = useNavigate()
  const phone = usePhone()
  const clock = useDailyClock(storage)
  const isSolved = isSolvedWith(storage)
  const tallies = MONTHS.map(m => tallyOf(data.year, m, data.launch, clock.today, isSolved))
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)

  const goTo = (to: number) => {
    if (to < 1 || to > 12 || to === month) return
    void navigate({ to: '/daily/$year/$month', params: { year: String(data.year), month: mm(to) }, replace: true })
  }
  useStep(dir => goTo(month + dir))

  const page = (m: number) => {
    const props = { data, month: m, tally: tallies[m - 1]!, clock, current: m === month }
    return props.tally.dim ? <DimMonth key={m} {...props} /> : <OpenMonth key={m} {...props} storage={storage} />
  }

  return (
    <main ref={ref} className={provinceStyles.page}>
      {phone ? (
        <Worlds carousel onSnap={i => goTo(i + 1)}>
          {MONTHS.map(page)}
        </Worlds>
      ) : (
        <>
          <Backdrop index={seasonOf(month)} />
          <Worlds>
            {MONTHS.map(m => {
              if (m === month) return page(m)
              const tally = tallies[m - 1]!
              return (
                <MonthSpine
                  key={m}
                  year={data.year}
                  month={m}
                  name={MONTH_NAMES[m - 1]!}
                  count={`${tally.solved}/${tally.dates.length}`}
                  conquered={tally.solved === tally.dates.length}
                  dim={tally.dim}
                />
              )
            })}
          </Worlds>
        </>
      )}
    </main>
  )
}

interface MonthProps {
  data: DailyYear
  month: number
  tally: MonthTally
  clock: DailyClock
  /** The page the URL names: it pairs in the Home morph and holds the pad's default. */
  current: boolean
}

/** An open Month: its calendar under the weekday headers, and Today at its foot while it's this Month. */
function OpenMonth({ data, month, tally, clock, current, storage }: MonthProps & { storage: ProgressStorage }) {
  const name = MONTH_NAMES[month - 1]!
  const id = `month-${month}`
  const thisMonth = clock.today.slice(0, 7) === `${data.year}-${mm(month)}`
  const todays = thisMonth ? summaryOf(data, clock.today) : undefined
  const solvedToday = isSolvedWith(storage)(clock.today)

  return (
    <World index={seasonOf(month)} labelledBy={id} style={monthMorphName(month)} start={current} pair={current}>
      <div className={provinceStyles.zoom}>
        <header className={provinceStyles.head}>
          <div className={provinceStyles.title}>
            <p className={provinceStyles.kicker}>Daily {data.year}</p>
            <h1 id={id} className={provinceStyles.name}>
              {name}
            </h1>
          </div>
          <CountPill conquered={tally.solved === tally.dates.length} className={provinceStyles.count}>
            {tally.solved} / {tally.dates.length}
          </CountPill>
        </header>
        <div className={styles.fit}>
          <MonthCalendar
            year={data.year}
            month={month}
            data={data}
            clock={clock}
            storage={storage}
            padDefault={current}
          />
        </div>
        <footer className={provinceStyles.foot}>
          <p className={provinceStyles.caption}>One new picture every day. Miss one and it’s gone.</p>
          {thisMonth && <FinishCard clock={clock} data={data} storage={storage} />}
          {todays && (
            <div className={campaignStyles.nextUp}>
              <Link
                to="/daily/$year/$month/$day"
                params={dayParams(clock.today)}
                className={campaignStyles.nextSlot}
                tabIndex={-1}
                aria-hidden="true"
              >
                <DayFace
                  date={clock.today}
                  status={solvedToday ? 'solved' : 'today'}
                  summary={todays}
                  storage={storage}
                />
              </Link>
              <div className={campaignStyles.nextText}>
                <p className={campaignStyles.nextLabel}>{solvedToday ? 'Solved today' : 'Today'}</p>
                <p className={campaignStyles.nextName}>{todays.title}</p>
                <p className={campaignStyles.nextSize}>{metaOf(todays)}</p>
              </div>
              {!solvedToday && (
                <>
                  <StartChip clock={clock} />
                  <Link to="/daily/$year/$month/$day" params={dayParams(clock.today)} data-variant="primary">
                    Play
                  </Link>
                </>
              )}
            </div>
          )}
        </footer>
      </div>
    </World>
  )
}

/** A Month still to come, or wholly before the Daily began: its page in the fog. */
function DimMonth({ data, month, tally, clock, current }: MonthProps) {
  const name = MONTH_NAMES[month - 1]!
  const id = `month-${month}`
  const before = tally.dates.length === 0
  const back = clock.today.startsWith(`${data.year}-`) ? clock.today : data.launch.startsWith(`${data.year}-`) ? data.launch : null
  const backName = back && MONTH_NAMES[Number(back.slice(5, 7)) - 1]

  return (
    <World index={seasonOf(month)} fog labelledBy={id} style={monthMorphName(month)} start={current}>
      <div className={`${provinceStyles.zoom} ${provinceStyles.locked}`}>
        <div className={provinceStyles.lockedMsg}>
          <p className={provinceStyles.kicker}>Daily {data.year}</p>
          <h1 id={id} className={provinceStyles.name}>
            {name}
          </h1>
          <p>
            {before
              ? `The Daily began on ${fullDate.format(startOf(data.launch))}.`
              : `${name}’s Dailies start on 1 ${name}, one a day.`}
          </p>
          {back && (
            <Link
              to="/daily/$year/$month"
              params={monthParams(back)}
              replace
              className={provinceStyles.paperLink}
              data-variant="paper"
              data-pad-default={current || undefined}
            >
              Back to {backName}
            </Link>
          )}
        </div>
      </div>
    </World>
  )
}
