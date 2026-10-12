import { useSyncExternalStore } from 'react'
import { useParams, useSearch } from '@tanstack/react-router'
import { Dymo } from '../album/Dymo.tsx'
import { paperStyle } from '../album/paper.ts'
import { Hud } from '../Hud.tsx'
import { SIDE_PAGE_GAP } from '../play/layout.ts'
import { BoardGhost, Film, Rail, Surface } from '../play/PlaySkeleton.tsx'
import { Bar, Fallback, SrLoading } from '../skeleton/Skeleton.tsx'
import { lessonPuzzle } from './lessons.ts'
import { type Track, trackOf } from './tracks.ts'
import playStyles from '../play/Play.module.css'
import skeleton from '../play/PlaySkeleton.module.css'
import styles from './Lesson.module.css'

/** `LessonPage`'s stacked layout, where the coach drops under the board. */
const STACKED = '(max-width: 860px)'

const subscribeStacked = (onChange: () => void) => {
  const query = matchMedia(STACKED)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/**
 * A Lesson while it loads, on its track's paper: Play's frame with the coach in the rail, or where it stacks, the
 * board card on cobalt with the coach under it. The track and Lesson come from the address, so their copy is real.
 */
export function LessonSkeleton() {
  const params = useParams({ from: '/learn/$track/$lesson' })
  const { learn } = useSearch({ from: '/learn/$track/$lesson' })
  const stacked = useSyncExternalStore(subscribeStacked, () => matchMedia(STACKED).matches)
  const track = trackOf(params.track)
  const index = track?.lessons.findIndex(l => l.id === params.lesson) ?? -1
  if (!track || index === -1) return <Fallback />

  const lesson = track.lessons[index]!
  const { width, height } = lessonPuzzle(lesson)
  const meta = `${lesson.picture} · ${width}×${height}`
  const board = <BoardGhost width={width} height={height} />
  const coach = (
    <Coach track={track} index={index} rail={!stacked} meta={meta} skip={learn ? 'All lessons' : track.skipText} />
  )

  if (stacked) {
    return (
      <>
        <Hud />
        <main className={`${playStyles.play} ${styles.page}`} style={paperStyle(track.paper)} aria-busy="true">
          <SrLoading />
          <div className={`${playStyles.desk} ${styles.desk}`} style={{ gap: SIDE_PAGE_GAP }}>
            <div className={`${playStyles.card} ${styles.card}`}>
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
    <main className={playStyles.shell} data-rail style={paperStyle(track.paper)} aria-busy="true">
      <SrLoading />
      <div className={playStyles.shellBody}>
        <Film
          count={track.lessons.length}
          current={index}
          head={
            <>
              {track.name}
              <Bar w={32} h={10} style={{ marginTop: 'var(--space-1)' }} />
            </>
          }
        />
        <Surface>{board}</Surface>
        <Rail>
          {coach}
          <div className={styles.railBody}>
            <Bar w={180} h={44} pill />
          </div>
        </Rail>
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
}: {
  track: Track
  index: number
  rail: boolean
  meta: string
  /** The foot's link: back to Learn, or the track's skip on a deep link. */
  skip: string
}) {
  const lesson = track.lessons[index]!
  return (
    <aside className={styles.coach} aria-hidden="true">
      {rail ? (
        <Dymo tone="pink" className={styles.coachTrack}>
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
        <span className={styles.skip}>{skip}</span>
      </div>
    </aside>
  )
}
