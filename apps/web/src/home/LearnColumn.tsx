import { Link } from '@tanstack/react-router'
import { type CSSProperties, useMemo } from 'react'
import { CountPill } from '../album/CountPill.tsx'
import { paperStyle } from '../album/paper.ts'
import { World } from '../campaign/worlds/Worlds.tsx'
import { lessonPuzzle } from '../tutorial/lessons.ts'
import { LessonSlot } from '../tutorial/LessonSlot.tsx'
import { TRACKS, type Track, firstUnfinished, lessonKey } from '../tutorial/tracks.ts'
import styles from './Home.module.css'

const ORDER = [TRACKS.tutorial, TRACKS.techniques]

const lessonLink = (track: Track, lesson: string) =>
  ({ to: '/learn/$track/$lesson', params: { track: track.id, lesson } }) as const

/**
 * Home's way into Learn, mirroring the Campaign column: how many Lessons are done, the one due next with a way
 * straight into it, and every Lesson on its track's shelf beside them. Once both tracks are done, Next lesson
 * replays the first.
 */
export function LearnColumn({
  done,
  index,
  start,
  style,
}: {
  done: ReadonlySet<string>
  /** Its paper, as `paperStyle`'s index. */
  index: number
  start: boolean
  style: CSSProperties
}) {
  const puzzles = useMemo(() => new Map(ORDER.flatMap(t => t.lessons.map(l => [l, lessonPuzzle(l)] as const))), [])
  const counts = ORDER.map(t => t.lessons.filter(l => done.has(lessonKey(t, l))).length)
  const finished = counts.reduce((a, b) => a + b, 0)
  const total = ORDER.reduce((n, t) => n + t.lessons.length, 0)
  const nextTrack = ORDER.find(t => firstUnfinished(t, done))
  const track = nextTrack ?? TRACKS.tutorial
  const lesson = (nextTrack && firstUnfinished(nextTrack, done)) ?? track.lessons[0]!
  const number = track.lessons.indexOf(lesson) + 1
  const here = counts[ORDER.indexOf(track)]!

  return (
    <World index={index} labelledBy="home-learn" style={style} start={start}>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>Lessons</p>
          <h2 id="home-learn" className={styles.hero}>
            Learn
          </h2>
          <CountPill conquered={!nextTrack} className={styles.count}>
            {finished} / {total}
          </CountPill>
          <div className={styles.bar} aria-hidden="true">
            {ORDER.map((t, i) => (
              <i key={t.id} style={{ ...paperStyle(t.paper), '--f': `${(counts[i]! / t.lessons.length) * 100}%` } as CSSProperties} />
            ))}
          </div>
          <p className={styles.sub}>
            {track.name} · {here}/{track.lessons.length}
          </p>
          <div className={styles.next}>
            <Link {...lessonLink(track, lesson.id)} className={styles.nextSlot} tabIndex={-1} aria-hidden="true">
              <LessonSlot number={number} puzzle={puzzles.get(lesson)!} picture={lesson.picture} done={false} />
            </Link>
            <div className={styles.nextText}>
              <p className={styles.kicker}>{nextTrack ? 'Next lesson' : 'Replay'}</p>
              <p className={styles.nextName}>{lesson.title}</p>
              <p className={styles.sub}>
                {track.name} · {number} of {track.lessons.length}
              </p>
            </div>
          </div>
          <div className={styles.actions}>
            <Link {...lessonLink(track, lesson.id)} data-variant="primary" data-pad-default>
              Next lesson
            </Link>
            <Link to="/learn" search={{ back: '/?open=learn' }} data-variant="paper">
              Open Learn
            </Link>
          </div>
        </div>
        <div className={styles.picture}>
          <div className={styles.shelves}>
            {ORDER.map(t => {
              const next = firstUnfinished(t, done)
              return (
                <section key={t.id} className={styles.shelf} aria-label={t.name}>
                  <p className={styles.kicker}>{t.name}</p>
                  <ol>
                    {t.lessons.map((l, i) => (
                      <li key={l.id}>
                        <Link
                          {...lessonLink(t, l.id)}
                          className={styles.lesson}
                          aria-label={`${t.name} lesson ${i + 1}: ${l.title}`}
                        >
                          <LessonSlot
                            number={i + 1}
                            puzzle={puzzles.get(l)!}
                            picture={l.picture}
                            done={done.has(lessonKey(t, l))}
                            next={l === next && t === nextTrack}
                          />
                          <span>{l.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ol>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </World>
  )
}
