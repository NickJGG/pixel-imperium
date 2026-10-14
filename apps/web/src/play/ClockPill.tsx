import { useEffect, useState, useSyncExternalStore } from 'react'
import { WatchIcon } from '../album/icons.tsx'
import { formatClock } from './clock.ts'
import { type PlayState, type PlayStore, elapsedAt } from './store.ts'
import styles from './Play.module.css'

function useClock<T>(store: PlayStore, select: (s: PlayState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()))
}

/** The Attempt's time, re-rendering on each whole second while the clock runs. */
function useElapsed(store: PlayStore): number {
  const elapsedMs = useClock(store, s => s.elapsedMs)
  const runningSince = useClock(store, s => s.runningSince)
  const [, setTick] = useState(0)
  useEffect(() => {
    if (runningSince === null) return
    let timer: ReturnType<typeof setTimeout>
    const schedule = () => {
      const ms = elapsedAt({ elapsedMs, runningSince }, store.now())
      timer = setTimeout(tick, 1000 - (ms % 1000))
    }
    const tick = () => {
      setTick(n => n + 1)
      schedule()
    }
    schedule()
    return () => clearTimeout(timer)
  }, [store, elapsedMs, runningSince])
  return elapsedAt({ elapsedMs, runningSince }, store.now())
}

const PauseIcon = () => (
  <svg viewBox="0 0 10 10" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <rect x="1.8" y="1.5" width="2.2" height="7" rx=".5" />
    <rect x="6" y="1.5" width="2.2" height="7" rx=".5" />
  </svg>
)

const ResumeIcon = () => (
  <svg viewBox="0 0 10 10" width="1em" height="1em" fill="currentColor" aria-hidden="true">
    <path d="M2.5 1.2 8.8 5 2.5 8.8z" />
  </svg>
)

/** The live clock; a tap pauses or resumes it. Idle until the Attempt's first input. */
export function ClockPill({ store }: { store: PlayStore }) {
  const time = formatClock(useElapsed(store))
  const paused = useClock(store, s => s.paused)
  const idle = useClock(store, s => s.runningSince === null && !s.paused)
  return (
    <button
      type="button"
      className={styles.clock}
      data-paused={paused || undefined}
      disabled={idle}
      aria-label={paused ? `Paused at ${time}` : `Pause. Time so far ${time}`}
      title={paused ? 'Resume' : 'Pause'}
      onClick={() => (paused ? store.resume() : store.pause())}
    >
      {paused ? <ResumeIcon /> : <PauseIcon />}
      {time}
    </button>
  )
}

/** Over the blurred board while paused; a click anywhere on it resumes. */
export function PauseVeil({ store }: { store: PlayStore }) {
  const elapsedMs = useClock(store, s => s.elapsedMs)
  const bestMs = useClock(store, s => s.bestMs)
  const hinted = useClock(store, s => s.attemptHinted)
  return (
    <div className={styles.pauseVeil} onClick={() => store.resume()}>
      <div className={styles.pauseCard}>
        <small>Paused</small>
        <b>{formatClock(elapsedMs)}</b>
        <p>
          {hinted ? 'Hinted, so it can’t set a best' : bestMs === null ? 'No best yet' : `Best ${formatClock(bestMs)}`}
        </p>
        <button type="button" data-variant="primary" data-size="compact">
          Resume
        </button>
      </div>
    </div>
  )
}

/** This visit's Solve time against the Best time, or the Best time alone on a puzzle solved before. */
export function TimeCard({ store }: { store: PlayStore }) {
  const solveMs = useClock(store, s => s.solveMs)
  const bestMs = useClock(store, s => s.bestMs)
  const priorBestMs = useClock(store, s => s.priorBestMs)
  const hinted = useClock(store, s => s.attemptHinted)
  const time = solveMs ?? bestMs
  if (time === null) return null
  const note = (() => {
    if (solveMs === null) return 'Your best'
    if (hinted) return `Hinted, so it can’t set a best${bestMs === null ? '' : ` · best ${formatClock(bestMs)}`}`
    if (priorBestMs === null) return 'Your best'
    if (solveMs < priorBestMs) {
      return (
        <>
          <em>New best</em> · was {formatClock(priorBestMs)}
        </>
      )
    }
    return `Best ${formatClock(priorBestMs)}`
  })()
  return (
    <div className={styles.timeCard}>
      <WatchIcon />
      <b>{formatClock(time)}</b>
      <span>{note}</span>
    </div>
  )
}
