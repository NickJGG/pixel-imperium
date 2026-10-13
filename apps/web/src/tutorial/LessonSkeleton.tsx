import type { ReactNode } from 'react'
import { useParams, useSearch } from '@tanstack/react-router'
import { Dymo } from '../album/Dymo.tsx'
import { paperStyle } from '../album/paper.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import { boardMorph, columnPaper, dymoMorph, slotName } from '../campaign/worlds/names.ts'
import { lessonId } from '../campaign/worlds/transitions.ts'
import { FloatingPills, Hud } from '../Hud.tsx'
import { SIDE_PAGE_GAP, useLessonStacked } from '../play/layout.ts'
import { BoardGhost, Film, Rail, Surface } from '../play/PlaySkeleton.tsx'
import { Bar, Fallback, SrLoading } from '../skeleton/Skeleton.tsx'
import { lessonPuzzle } from './lessons.ts'
import { type Track, trackOf } from './tracks.ts'
import playStyles from '../play/Play.module.css'
import skeleton from '../play/PlaySkeleton.module.css'
import styles from './Lesson.module.css'

/**
 * A Lesson while it loads, on its track's paper: Play's frame with the coach in the rail, or where it stacks, the
 * board card on cobalt with the coach under it. The track and Lesson come from the address, so their copy is real.
 * It pairs with Learn and the other Lessons as the Lesson does, so the board morphs can play into it.
 */
export function LessonSkeleton() {
  const params = useParams({ from: '/learn/$track/$lesson' })
  const { learn } = useSearch({ from: '/learn/$track/$lesson' })
  const stacked = useLessonStacked()
  useAnnounceSkeleton()
  const track = trackOf(params.track)
  const index = track?.lessons.findIndex(l => l.id === params.lesson) ?? -1
  if (!track || index === -1) return <Fallback />

  const lesson = track.lessons[index]!
  const { width, height } = lessonPuzzle(lesson)
  const meta = `${lesson.picture} · ${width}×${height}`
  const paperMorph = columnPaper(`track-${track.id}`)
  const board = <BoardGhost width={width} height={height} name={slotName(lessonId(track.id, lesson.id))} />
  const coach = (
    <Coach
      track={track}
      index={index}
      rail={!stacked}
      meta={meta}
      skip={learn ? 'All lessons' : track.skipText}
      pinned={
        !stacked && (
          <div className={styles.railMain}>
            <Bar w={lesson.free ? '100%' : 96} h={44} pill />
            {lesson.free && <Bar w="100%" h={52} pill />}
          </div>
        )
      }
    />
  )

  if (stacked) {
    return (
      <>
        <Hud />
        <main
          className={`${playStyles.play} ${styles.page}`}
          {...paperMorph}
          style={{ ...paperStyle(track.paper), ...paperMorph.style }}
          aria-busy="true"
        >
          <SrLoading />
          <div className={`${playStyles.desk} ${styles.desk}`} style={{ gap: SIDE_PAGE_GAP }}>
            <div className={`${playStyles.card} ${styles.card}`} {...boardMorph('surface', 'surface')}>
              <header className={playStyles.cardHead}>
                <Dymo tone="pink">{track.label}</Dymo>
                <span className={playStyles.size}>{meta}</span>
              </header>
              <div className={`${playStyles.stage} ${styles.stage} ${skeleton.stage}`}>{board}</div>
              <Bar w="min(240px, 100%)" h={44} pill />
            </div>
            <div className={styles.side} style={{ gap: SIDE_PAGE_GAP }}>
              {coach}
            </div>
          </div>
        </main>
      </>
    )
  }
  return (
    <main
      className={playStyles.shell}
      data-rail
      {...paperMorph}
      style={{ ...paperStyle(track.paper), ...paperMorph.style }}
      aria-busy="true"
    >
      <SrLoading />
      <FloatingPills />
      <div className={playStyles.shellBody}>
        <Film
          count={track.lessons.length}
          current={index}
          ids={track.lessons.map(l => lessonId(track.id, l.id))}
          head={
            <>
              {track.name}
              <Bar w={32} h={10} style={{ marginTop: 'var(--space-1)' }} />
            </>
          }
        />
        <Surface>{board}</Surface>
        <Rail>{coach}</Rail>
      </div>
    </main>
  )
}

function Coach({
  track,
  index,
  rail,
  meta,
  skip,
  pinned,
}: {
  track: Track
  index: number
  rail: boolean
  meta: string
  /** The foot's link: back to Learn, or the track's skip on a deep link. */
  skip: string
  /** The rail's tools, over the foot's link. */
  pinned?: ReactNode
}) {
  const lesson = track.lessons[index]!
  return (
    <aside className={styles.coach} aria-hidden="true">
      {rail ? (
        <Dymo tone="pink" className={styles.coachTrack} {...dymoMorph(lessonId(track.id, lesson.id))}>
          {track.label}
        </Dymo>
      ) : (
        <ol className={styles.lessons}>
          {track.lessons.map((l, i) => (
            <li key={l.id} data-state={i === index ? 'now' : undefined}>
              {i + 1}
            </li>
          ))}
        </ol>
      )}
      <h1 className={styles.coachTitle}>{lesson.title}</h1>
      {rail && <p className={styles.coachMeta}>{meta}</p>}
      {lesson.steps.length > 1 && (
        <ol className={styles.steps}>
          {lesson.steps.map((_, i) => (
            <li key={i} />
          ))}
        </ol>
      )}
      <div className={styles.log}>
        <Bar w="100%" h={14} />
        <Bar w="85%" h={14} />
        <Bar w="60%" h={14} />
      </div>
      <div className={styles.foot}>
        {pinned && <div className={styles.pinned}>{pinned}</div>}
        <a data-variant="paper">
          {skip}
        </a>
      </div>
    </aside>
  )
}
