import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { TRACKS, type Track } from './tracks.ts'
import styles from './Learn.module.css'

/** Learn while the page it goes back to loads: both tracks with their own copy, the Lessons' slots empty. */
export function LearnSkeleton() {
  return (
    <main className={styles.page} aria-busy="true">
      <SrLoading />
      <Worlds>
        <TrackWorld track={TRACKS.tutorial} lead />
        <TrackWorld track={TRACKS.techniques} tag />
      </Worlds>
    </main>
  )
}

function TrackWorld({ track, lead = false, tag = false }: { track: Track; lead?: boolean; tag?: boolean }) {
  return (
    <World index={track.paper}>
      <div className={styles.column} aria-hidden="true">
        {lead && <Bar w={120} h={12} />}
        <p className={styles.kicker}>
          {track.label} · <Bar w={70} h={10} style={{ display: 'inline-block' }} />
        </p>
        <h2 className={styles.name}>
          {track.name}
          {tag && <Bar w={150} h={26} />}
        </h2>
        <p className={styles.blurb}>{track.blurb}</p>
        <ol className={styles.lessons}>
          {track.lessons.map(lesson => {
            const steps = lesson.steps.length
            return (
              <li key={lesson.id} className={styles.lesson}>
                <Ghost style={{ width: '100%', aspectRatio: 1 }} />
                <span className={styles.caption}>
                  <b>{lesson.title}</b>
                  {steps} {steps === 1 ? 'step' : 'steps'}
                </span>
              </li>
            )
          })}
        </ol>
        <div className={styles.actions}>
          <Bar w={220} h={56} pill />
        </div>
      </div>
    </World>
  )
}
