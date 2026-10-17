import { useRef } from 'react'
import { useParams } from '@tanstack/react-router'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import { Backdrop, SkeletonSpine, World, Worlds, trackMorphName, usePhone, useSpineReach } from '../campaign/worlds/Worlds.tsx'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { useHudTrail } from '../Trail.tsx'
import { trackTrail } from '../trails.ts'
import { TRACKS, TRACK_ORDER, type Track, trackOf } from './tracks.ts'
import styles from './Learn.module.css'

/**
 * Learn while the page it goes back to loads: the track the URL names open with its own copy and its Lessons' slots
 * empty, the other its spine, paired with the page's own so a morph can play into it.
 */
export function LearnSkeleton() {
  const { track: id } = useParams({ strict: false })
  const track = (id !== undefined && trackOf(id)) || TRACKS.tutorial
  const phone = usePhone()
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)
  useAnnounceSkeleton()
  useHudTrail(trackTrail(track))
  return (
    <main ref={ref} className={styles.page} aria-busy="true">
      <SrLoading />
      <Backdrop paper={track.paper} />
      <Worlds carousel={phone}>
        {TRACK_ORDER.map(t =>
          t === track || phone ? (
            <TrackWorld key={t.id} track={t} current={t === track} />
          ) : (
            <SkeletonSpine
              key={t.id}
              paper={t.paper}
              state="active"
              thin
              pairs="province"
              style={trackMorphName(t.id)}
              name={t.name}
            >
              <Bar w={44} h={22} pill />
            </SkeletonSpine>
          ),
        )}
      </Worlds>
    </main>
  )
}

function TrackWorld({ track, current }: { track: Track; current: boolean }) {
  return (
    <World paper={track.paper} style={trackMorphName(track.id)} start={current} pair={current}>
      <div className={styles.column} aria-hidden="true">
        <Bar w={120} h={12} />
        <p className={styles.kicker}>
          {track.label} · <Bar w={70} h={10} style={{ display: 'inline-block' }} />
        </p>
        <h2 className={styles.name}>
          {track.name}
          {track === TRACKS.techniques && <Bar w={150} h={26} />}
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
