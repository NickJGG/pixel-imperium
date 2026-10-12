/**
 * Learn: the two tracks as Worlds columns in their own papers, every Lesson a slot, its picture printed in
 * it once done. A track's button resumes at its first unfinished Lesson, and any slot opens its Lesson.
 */
import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Dymo } from '../album/Dymo.tsx'
import { useAccount } from '../account.ts'
import { campaignProgress, techniquesRecommended } from '../campaign/progress.ts'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { usePadPage } from '../pad/PadProvider.tsx'
import { clearUnseen, getUnseen, useLessonsDone } from './done.ts'
import { type LearnBack, backLink } from './handoff.ts'
import { lessonPuzzle } from './lessons.ts'
import { LessonSlot } from './LessonSlot.tsx'
import { TRACKS, type Track, firstUnfinished, lessonKey } from './tracks.ts'
import styles from './Learn.module.css'

export function LearnPage({ back }: { back: LearnBack }) {
  const done = useLessonsDone()
  const { storage } = useAccount()
  const { campaign } = back
  const recommended = useMemo(
    () => campaign !== null && techniquesRecommended(campaign, campaignProgress(campaign, storage)),
    [campaign, storage],
  )
  const [fresh] = useState(getUnseen)
  useEffect(clearUnseen, [])
  // B goes where the back link does; from Home, that's Learn's own column.
  usePadPage({ parent: back.to === '/' ? undefined : back.to })

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Learn</h1>
      <Worlds>
        <TrackWorld
          track={TRACKS.tutorial}
          done={done}
          fresh={fresh}
          back={back.to}
          lead={
            <Link {...backLink(back.to)} className={styles.back}>
              ← <span>{back.label}</span>
            </Link>
          }
        />
        <TrackWorld
          track={TRACKS.techniques}
          done={done}
          fresh={fresh}
          back={back.to}
          tag={recommended ? <Dymo tone="pink">Recommended now</Dymo> : <Dymo>Best after the Coast</Dymo>}
        />
      </Worlds>
    </main>
  )
}

interface TrackProps {
  track: Track
  done: ReadonlySet<string>
  /** Keys whose ✓ pops, finished since Learn was last shown. */
  fresh: ReadonlySet<string>
  back: string
  /** Shown beside the name until the track is complete. */
  tag?: ReactNode
  /** Above the kicker. */
  lead?: ReactNode
}

function TrackWorld({ track, done, fresh, back, tag, lead }: TrackProps) {
  const { lessons } = track
  const puzzles = useMemo(() => lessons.map(lessonPuzzle), [lessons])
  const count = lessons.filter(l => done.has(lessonKey(track, l))).length
  const next = firstUnfinished(track, done)
  const search = { back, learn: true as const }
  const to = (id: string) => ({ to: '/learn/$track/$lesson', params: { track: track.id, lesson: id }, search }) as const
  const id = `${track.id}-title`

  return (
    <World index={track.paper} labelledBy={id}>
      <div className={styles.column}>
        {lead}
        <p className={styles.kicker}>
          {track.label} · {count} / {lessons.length} done
        </p>
        <h2 id={id} className={styles.name}>
          {track.name}
          {next ? tag : <Dymo className={styles.complete}>Complete</Dymo>}
        </h2>
        <p className={styles.blurb}>{track.blurb}</p>
        <ol className={styles.lessons}>
          {lessons.map((lesson, i) => {
            const key = lessonKey(track, lesson)
            const steps = lesson.steps.length
            return (
              <li key={lesson.id}>
                <Link {...to(lesson.id)} className={styles.lesson} aria-label={`Lesson ${i + 1}: ${lesson.title}`}>
                  <LessonSlot
                    number={i + 1}
                    puzzle={puzzles[i]!}
                    picture={lesson.picture}
                    done={done.has(key)}
                    next={lesson === next}
                    fresh={fresh.has(key)}
                  />
                  <span className={styles.caption}>
                    <b>{lesson.title}</b>
                    {steps} {steps === 1 ? 'step' : 'steps'}
                  </span>
                </Link>
              </li>
            )
          })}
        </ol>
        <div className={styles.actions}>
          {next ? (
            <Link {...to(next.id)} data-variant="primary" data-pad-default>
              {count === 0 ? 'Start' : 'Continue'}
              <small>
                {lessons.indexOf(next) + 1}. {next.title}
              </small>
            </Link>
          ) : (
            <Link {...to(lessons[0]!.id)} data-variant="paper">
              Replay from lesson 1
            </Link>
          )}
        </div>
      </div>
    </World>
  )
}
