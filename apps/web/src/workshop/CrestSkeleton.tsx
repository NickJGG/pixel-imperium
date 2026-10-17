import { useParams } from '@tanstack/react-router'
import { getAccount } from '../account.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { useHudTrail } from '../Trail.tsx'
import { HOME, crestTrail } from '../trails.ts'
import { crestWidth } from './campaign-draft.ts'
import { peekCampaign } from './campaign-store.ts'
import home from '../home/Home.module.css'
import own from './Workshop.module.css'
import styles from './Builder.module.css'

/** A draft's Crest while it loads: its grid's shape from this device's copy of the draft, a square without one, and the rail as bars. */
export function CrestSkeleton() {
  useAnnounceSkeleton()
  const { id } = useParams({ from: '/workshop/c/$id/crest' })
  const userId = getAccount().account?.userId
  const stored = userId === undefined ? null : peekCampaign({ userId, id })
  const crest = stored?.doc.crest
  useHudTrail(stored ? crestTrail(id, stored.doc) : [HOME])
  return (
    <main className={own.page} aria-busy="true">
      <SrLoading />
      <Worlds>
        <World paper={stored?.doc.paper ?? 'workshop'} start>
          <div className={styles.crestPage}>
            <div className={styles.crestStage}>
              <Ghost
                style={{
                  width: 'min(100%, 420px)',
                  aspectRatio: crest ? `${crestWidth(crest)} / ${crest.rows.length}` : 1,
                }}
              />
            </div>
            <aside className={styles.crestRail}>
              <Bar w="60%" h={14} />
              <h1 className={home.hero}>Crest</h1>
              <Bar w={120} h={24} pill />
              <Bar w={160} h={32} pill />
              <Bar w="80%" h={36} />
              <Bar w="70%" h={32} />
              <div className={home.actions}>
                <Bar w={120} h={52} pill />
                <Bar w={160} h={52} pill />
              </div>
            </aside>
          </div>
        </World>
      </Worlds>
    </main>
  )
}
