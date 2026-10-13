import { useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import type { PuzzleClues } from '@pixel-imperium/protocol'
import { seasonOf, seasonStyle } from '../album/paper.ts'
import { type AccountState, useAccount } from '../account.ts'
import { EdgeState } from '../EdgeStates.tsx'
import { Hud } from '../Hud.tsx'
import { Play } from '../play/PlayPage.tsx'
import { GRACE_MS, dailyClock, dailyState, finishLeft, formatLeft, startOf } from './clock.ts'
import { monthParams } from './month.ts'
import { useNow } from './useNow.ts'
import styles from '../play/Play.module.css'

const route = getRouteApi('/daily/$year/$month/$day')

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'long' })
const monthName = new Intl.DateTimeFormat(undefined, { month: 'long' })

export function DailyPlayPage() {
  const { puzzle, date } = route.useLoaderData()
  const account = useAccount()
  return <DailyPlay key={`${account.generation}:${puzzle.id}`} puzzle={puzzle} date={date} account={account} />
}

/** Decides once, on arrival, whether the Daily can be played; a clock running out mid-solve only turns the chip. */
function DailyPlay({ puzzle, date, account }: { puzzle: PuzzleClues; date: string; account: AccountState }) {
  const [state] = useState(() => dailyState(date, dailyClock(new Date(), account.storage)))
  const day = startOf(date)
  const month = day.getMonth() + 1

  if (state === 'gone' || state === 'early') {
    return (
      <>
        <Hud float />
        <EdgeState
          paper={seasonOf(month)}
          kicker={`Daily · ${weekday.format(day)} ${day.getDate()} ${monthName.format(day)}`}
          title={state === 'gone' ? 'Gone' : 'Not out yet'}
          mark={day.getDate()}
          actions={
            <>
              <Link to="/daily/$year/$month" params={monthParams(date)} data-variant="primary" data-pad-default>
                Back to {monthName.format(day)}
              </Link>
              <Link to="/" data-variant="paper">
                Home
              </Link>
            </>
          }
        >
          <p>
            {state === 'gone'
              ? `${weekday.format(day)}’s Daily has gone. Each one can only be played on its own day.`
              : `${weekday.format(day)}’s Daily isn’t out yet.`}
          </p>
        </EdgeState>
      </>
    )
  }
  return (
    <Play
      puzzle={puzzle}
      account={account}
      context={{
        place: monthName.format(day),
        paper: seasonStyle(month),
        back: `/daily/${date.slice(0, 4)}/${date.slice(5, 7)}`,
        here: `/daily/${date.replaceAll('-', '/')}`,
        meta: [`${puzzle.width}×${puzzle.height}`, weekday.format(day), puzzle.tier]
          .filter(Boolean)
          .join(' · '),
        chip: <FinishChip date={date} />,
      }}
    />
  )
}

function FinishChip({ date }: { date: string }) {
  const left = finishLeft(date, useNow())
  return (
    <span className={styles.finish} data-late={left <= GRACE_MS || undefined} role="timer">
      {left > 0 ? `Finish by 01:00 · ${formatLeft(left)}` : 'Time’s up'}
    </span>
  )
}
