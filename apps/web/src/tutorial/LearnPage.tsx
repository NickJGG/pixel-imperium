/**
 * Learn: one track's Lessons as a Worlds column in its paper, every Lesson a slot, its picture printed in it once
 * done; the other track stands as a spine beside it, and on a phone the two make a carousel. Moving to the other
 * track replaces this page in history. A track's button resumes at its first unfinished Lesson, and any slot opens
 * its Lesson.
 */
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { Dymo } from '../album/Dymo.tsx'
import { useAccount } from '../account.ts'
import { campaignProgress, techniquesRecommended } from '../campaign/progress.ts'
import { Backdrop, TrackSpine, World, Worlds, trackMorphName, usePhone, useSpineReach, useStep } from '../campaign/worlds/Worlds.tsx'
import { lessonId } from '../campaign/worlds/transitions.ts'
import { useHudTrail } from '../Trail.tsx'
import { trackTrail } from '../trails.ts'
import { clearUnseen, getUnseen, useLessonsDone } from './done.ts'
import { type LearnBack, backLink } from './handoff.ts'
import { lessonPuzzle } from './lessons.ts'
import { LessonSlot } from './LessonSlot.tsx'
import { TRACKS, TRACK_ORDER, type Track, firstUnfinished, lessonKey } from './tracks.ts'
import styles from './Learn.module.css'

export function LearnPage({ track, back }: { track: Track; back: LearnBack }) {
  const done = useLessonsDone()
  const { storage } = useAccount()
  const navigate = useNavigate()
  const phone = usePhone()
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)
  useHudTrail(trackTrail(track))
  const { campaign } = back
  const recommended = useMemo(
    () => campaign !== null && techniquesRecommended(campaign, campaignProgress(campaign, storage)),
    [campaign, storage],
  )
  const [fresh] = useState(getUnseen)
  useEffect(clearUnseen, [])

  const goTo = (to: Track | undefined) => {
    if (!to || to === track) return
    void navigate({ to: '/learn/$track', params: { track: to.id }, search: { back: back.to }, replace: true })
  }
  // B goes where the back link does; from Home, that's Learn's own column.
  useStep(dir => goTo(TRACK_ORDER[TRACK_ORDER.indexOf(track) + dir]), { parent: back.to === '/' ? undefined : back.to })

  const world = (t: Track) => (
    <TrackWorld
      key={t.id}
      track={t}
      current={t === track}
      done={done}
      fresh={fresh}
      back={back.to}
      lead={
        <Link {...backLink(back.to)} className={styles.back}>
          ← <span>{back.label}</span>
        </Link>
      }
      tag={
        t === TRACKS.techniques &&
        (recommended ? <Dymo tone="pink">Recommended now</Dymo> : <Dymo>Best after the Coast</Dymo>)
      }
    />
  )

  return (
    <main ref={ref} className={styles.page}>
      <h1 className={styles.srOnly}>Learn</h1>
      <Backdrop paper={track.paper} />
      {phone ? (
        <Worlds carousel onSnap={i => goTo(TRACK_ORDER[i])}>
          {TRACK_ORDER.map(world)}
        </Worlds>
      ) : (
        <Worlds>
          {TRACK_ORDER.map(t =>
            t === track ? (
              world(t)
            ) : (
              <TrackSpine
                key={t.id}
                track={t.id}
                name={t.name}
                paper={t.paper}
                done={t.lessons.filter(l => done.has(lessonKey(t, l))).length}
                total={t.lessons.length}
                back={back.to}
              />
            ),
          )}
        </Worlds>
      )}
    </main>
  )
}

interface TrackProps {
  track: Track
  /** The track the URL names: where a carousel rests, holding the pad's default. */
  current: boolean
  done: ReadonlySet<string>
  /** Keys whose ✓ pops, finished since Learn was last shown. */
  fresh: ReadonlySet<string>
  back: string
  /** Shown beside the name until the track is complete. */
  tag?: ReactNode
  /** Above the kicker. */
  lead?: ReactNode
}

function TrackWorld({ track, current, done, fresh, back, tag, lead }: TrackProps) {
  const { lessons } = track
  const puzzles = useMemo(() => lessons.map(lessonPuzzle), [lessons])
  const count = lessons.filter(l => done.has(lessonKey(track, l))).length
  const next = firstUnfinished(track, done)
  const search = { back, learn: true as const }
  const to = (id: string) => ({ to: '/learn/$track/$lesson', params: { track: track.id, lesson: id }, search }) as const
  const id = `${track.id}-title`

  return (
    <World paper={track.paper} labelledBy={id} style={trackMorphName(track.id)} start={current} pair={current}>
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
                    morph={lessonId(track.id, lesson.id)}
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
            <Link {...to(next.id)} data-variant="primary" data-pad-default={current || undefined}>
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
