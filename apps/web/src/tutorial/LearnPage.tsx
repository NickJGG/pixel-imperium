/**
 * Learn: every Lesson of both tracks, each picture shown once its Lesson is done. A track's button
 * resumes at its first unfinished Lesson, and any card opens its Lesson directly.
 */
import { type CSSProperties, type ReactNode, useEffect, useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { Dymo } from '../album/Dymo.tsx'
import { paperStyle } from '../album/paper.ts'
import { useAccount } from '../account.ts'
import { PixelArt } from '../campaign/PixelArt.tsx'
import { campaignProgress, techniquesRecommended } from '../campaign/progress.ts'
import { clearUnseen, getUnseen, useLessonsDone } from './done.ts'
import type { LearnBack } from './handoff.ts'
import { lessonPuzzle } from './lessons.ts'
import { TRACKS, type Track, firstUnfinished, lessonKey } from './tracks.ts'
import playStyles from '../play/Play.module.css'
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

  return (
    <main className={styles.page}>
      <div className={styles.learn}>
        <header className={styles.head}>
          <div>
            <h1>Learn</h1>
            <p>Guided pictures that teach you to read the clues. Free, and nothing is lost.</p>
          </div>
          <Link to={back.to} className={`${playStyles.linkButton} ${playStyles.paper}`}>
            ← {back.label}
          </Link>
        </header>
        <TrackSection track={TRACKS.tutorial} paper={0} done={done} fresh={fresh} back={back.to} />
        <TrackSection
          track={TRACKS.techniques}
          paper={1}
          done={done}
          fresh={fresh}
          back={back.to}
          tag={recommended ? <Dymo tone="pink">Recommended now</Dymo> : <Dymo>Best after the Coast</Dymo>}
        />
      </div>
    </main>
  )
}

interface TrackProps {
  track: Track
  paper: number
  done: ReadonlySet<string>
  /** Keys whose ✓ pops, finished since Learn was last shown. */
  fresh: ReadonlySet<string>
  back: string
  /** Shown beside the name until the track is complete. */
  tag?: ReactNode
}

function TrackSection({ track, paper, done, fresh, back, tag }: TrackProps) {
  const { lessons } = track
  const puzzles = useMemo(() => lessons.map(lessonPuzzle), [lessons])
  const count = lessons.filter(l => done.has(lessonKey(track, l))).length
  const next = firstUnfinished(track, done)
  const search = { back, learn: true as const }
  const to = (id: string) => ({ to: '/learn/$track/$lesson', params: { track: track.id, lesson: id }, search }) as const

  return (
    <section className={styles.track} style={paperStyle(paper)} aria-labelledby={`${track.id}-title`}>
      <div className={styles.trackTop}>
        <h2 id={`${track.id}-title`}>
          {track.name}{' '}
          {next ? tag : <Dymo className={styles.complete}>Complete</Dymo>}
        </h2>
        {!next ? (
          <Link {...to(lessons[0]!.id)} className={`${playStyles.linkButton} ${playStyles.paper}`}>
            Replay from lesson 1
          </Link>
        ) : (
          <Link {...to(next.id)} className={playStyles.linkButton}>
            {count === 0 ? `Start: ${next.title}` : `Continue: ${lessons.indexOf(next) + 1}. ${next.title}`}
          </Link>
        )}
      </div>
      <p className={styles.meta}>
        {track.blurb}{' '}
        <span className={styles.label}>
          {count}/{lessons.length} done
        </span>
      </p>
      <ol className={styles.lessons}>
        {lessons.map((lesson, i) => {
          const key = lessonKey(track, lesson)
          const isDone = done.has(key)
          const here = count > 0 && lesson === next
          const { width, height, palette } = puzzles[i]!
          const steps = lesson.steps.length
          return (
            <li key={lesson.id}>
              <Link {...to(lesson.id)} className={styles.lesson} data-current={here || undefined}>
                {here && (
                  <Dymo tone="pink" className={styles.here}>
                    You are here
                  </Dymo>
                )}
                {isDone && (
                  <span className={styles.check} data-fresh={fresh.has(key) || undefined} aria-label="Done">
                    ✓
                  </span>
                )}
                <span className={styles.thumb}>
                  {isDone ? (
                    <PixelArt title={lesson.picture} width={width} height={height} palette={palette} />
                  ) : (
                    <BlankGrid width={width} height={height} />
                  )}
                </span>
                <span className={styles.label}>Lesson {i + 1}</span>
                <span className={styles.title}>{lesson.title}</span>
                <span className={styles.size}>
                  {width}×{height} · {steps} {steps === 1 ? 'step' : 'steps'}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

function BlankGrid({ width, height }: { width: number; height: number }) {
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      aria-hidden="true"
      style={{ aspectRatio: `${width} / ${height}` } as CSSProperties}
    >
      <g className={styles.gridLines}>
        {Array.from({ length: width - 1 }, (_, i) => (
          <line key={`c${i}`} x1={i + 1} y1={0} x2={i + 1} y2={height} />
        ))}
        {Array.from({ length: height - 1 }, (_, i) => (
          <line key={`r${i}`} x1={0} y1={i + 1} x2={width} y2={i + 1} />
        ))}
      </g>
      <rect className={styles.gridEdge} width={width} height={height} />
    </svg>
  )
}
