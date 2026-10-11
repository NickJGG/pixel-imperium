import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Dymo } from '../album/Dymo.tsx'
import { PixelArt } from '../campaign/PixelArt.tsx'
import { useLessonsDone } from './done.ts'
import { BlankGrid } from './LearnPage.tsx'
import { lessonPuzzle } from './lessons.ts'
import { TRACKS, type Track, firstUnfinished, lessonKey, startedTrack } from './tracks.ts'
import cover from '../campaign/Cover.module.css'
import styles from './Learn.module.css'

const ORDER = [TRACKS.tutorial, TRACKS.techniques]
const search = { back: '/', learn: true as const }
const to = (track: Track, lesson: string) =>
  ({ to: '/learn/$track/$lesson', params: { track: track.id, lesson }, search }) as const

/** Learn in miniature for home: both tracks' Lessons, and one button to the first unfinished across them. */
export function LearnCard({ recommended }: { recommended: boolean }) {
  const done = useLessonsDone()
  const puzzles = useMemo(() => new Map(ORDER.flatMap(t => t.lessons.map(l => [l, lessonPuzzle(l)] as const))), [])
  const next = ORDER.flatMap(track => {
    const lesson = firstUnfinished(track, done)
    return lesson ? [{ track, lesson }] : []
  })[0]
  const fresh = !ORDER.some(t => startedTrack(t, done))

  return (
    <section className={cover.card} aria-labelledby="learn-card-title">
      <h2 id="learn-card-title" className={`${cover.label} ${styles.cardHead}`}>
        <Link to="/learn" search={{ back: '/' }}>
          Learn →
        </Link>
        {!next && <Dymo className={styles.complete}>Complete</Dymo>}
      </h2>
      {ORDER.map(track => {
        const count = track.lessons.filter(l => done.has(lessonKey(track, l))).length
        const complete = count === track.lessons.length
        return (
          <div key={track.id} className={styles.mini}>
            <h3 className={styles.miniHead}>
              <span>
                {track.name}
                {track === TRACKS.techniques &&
                  !complete &&
                  (recommended ? <Dymo tone="pink">Recommended now</Dymo> : <Dymo>Best after the Coast</Dymo>)}
              </span>
              <small>
                {count}/{track.lessons.length} done
              </small>
            </h3>
            <ol className={styles.miniLessons}>
              {track.lessons.map(lesson => {
                const isDone = done.has(lessonKey(track, lesson))
                const { width, height, palette } = puzzles.get(lesson)!
                return (
                  <li key={lesson.id}>
                    <Link
                      {...to(track, lesson.id)}
                      className={styles.miniLesson}
                      data-current={(!fresh && lesson === next?.lesson) || undefined}
                    >
                      {isDone && (
                        <span className={styles.check} aria-label="Done">
                          ✓
                        </span>
                      )}
                      {isDone ? (
                        <PixelArt title={lesson.picture} width={width} height={height} palette={palette} />
                      ) : (
                        <BlankGrid width={width} height={height} />
                      )}
                      <span>{lesson.title}</span>
                    </Link>
                  </li>
                )
              })}
            </ol>
          </div>
        )
      })}
      <div className={styles.cardFoot}>
        {next ? (
          <Link {...to(next.track, next.lesson.id)} data-variant="primary">
            {fresh ? 'Start' : 'Continue'}
          </Link>
        ) : (
          <Link
            {...to(TRACKS.tutorial, TRACKS.tutorial.lessons[0]!.id)}
            data-variant="paper"
          >
            Replay from lesson 1
          </Link>
        )}
      </div>
    </section>
  )
}
