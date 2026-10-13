import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { boardMorph, markUnseen, slotMorph } from '../campaign/worlds/names.ts'
import { lessonId } from '../campaign/worlds/transitions.ts'
import { CrownMark } from '../Hud.tsx'
import { useCentredFilm } from '../play/Filmstrip.tsx'
import { useLessonsDone } from './done.ts'
import { lessonPuzzle } from './lessons.ts'
import { LessonSlot } from './LessonSlot.tsx'
import { type Track, lessonKey } from './tracks.ts'
import playStyles from '../play/Play.module.css'

/**
 * A track's Lessons down the left of a Lesson, as Play's filmstrip, the current one ringed. They link to each
 * other only when opened from Learn; a deep link's run goes in order.
 */
export function LessonFilm({ track, index, back }: { track: Track; index: number; back: string | null }) {
  const { lessons } = track
  const done = useLessonsDone()
  const puzzles = useMemo(() => lessons.map(lessonPuzzle), [lessons])
  const count = lessons.filter(l => done.has(lessonKey(track, l))).length
  const { listRef, currentRef } = useCentredFilm()

  return (
    <nav className={playStyles.film} aria-label={`${track.name} lessons`} {...boardMorph('film', 'film')}>
      <Link to="/" className={playStyles.filmMark} aria-label="Pixel Imperium">
        <CrownMark />
      </Link>
      <p className={playStyles.filmHead}>
        {track.name}
        <span>
          {count} / {lessons.length}
        </span>
      </p>
      <ol ref={listRef} className={playStyles.filmSlots} onScroll={e => markUnseen(e.currentTarget)}>
        {lessons.map((lesson, i) => {
          const slot = (
            <LessonSlot
              number={i + 1}
              puzzle={puzzles[i]!}
              picture={lesson.picture}
              done={done.has(lessonKey(track, lesson))}
              next={i === index}
            />
          )
          if (i === index) {
            const { width, height } = puzzles[i]!
            return (
              <li key={lesson.id} ref={currentRef} className={playStyles.filmCurrent} aria-current="page">
                <span className={playStyles.filmSlot}>{slot}</span>
                <span className={playStyles.filmCaption}>
                  #{i + 1} · {width}×{height}
                </span>
              </li>
            )
          }
          return (
            <li key={lesson.id} {...slotMorph(lessonId(track.id, lesson.id))}>
              {back === null ? (
                slot
              ) : (
                <Link
                  to="/learn/$track/$lesson"
                  params={{ track: track.id, lesson: lesson.id }}
                  search={{ back, learn: true }}
                  aria-label={`Lesson ${i + 1}: ${lesson.title}`}
                >
                  {slot}
                </Link>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
