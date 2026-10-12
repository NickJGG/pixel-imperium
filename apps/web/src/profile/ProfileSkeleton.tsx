import { useParams } from '@tanstack/react-router'
import { HandleHero } from '../album/HandleHero.tsx'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { CALENDAR_WEEKS } from './activity.ts'
import styles from './Profile.module.css'
import showcaseStyles from './Showcase.module.css'

/** The showcase's spots, as `Showcase` lays them. */
const SPOTS = [
  { tilt: -4, width: '38%' },
  { tilt: 5, width: '28%' },
  { tilt: -2, width: '28%' },
]

const FACTS = ['Pages complete', 'Biggest solved', 'Streak', 'Cells filled', 'Last solve']

/** A volume's Stamps: five of its own, one per province but the last, and the album. */
const STAMPS = 11

/** A profile while it loads: the cover with the handle from the address, the Record and the Stamps. */
export function ProfileSkeleton() {
  const { handle } = useParams({ from: '/u/$handle' })
  return (
    <main className={styles.page} aria-busy="true">
      <SrLoading />
      <Worlds>
        <World index={0} className={styles.cover}>
          <div className={styles.column} data-surface="cobalt">
            <Bar w={140} h={12} />
            <HandleHero handle={handle} />
            <ul className={showcaseStyles.showcase} aria-hidden="true">
              {SPOTS.map(({ tilt, width }, i) => (
                <li key={i} style={{ width }}>
                  <Ghost style={{ width: '100%', aspectRatio: 1, rotate: `${tilt}deg` }} />
                </li>
              ))}
            </ul>
            <Bar w={200} h={12} />
          </div>
        </World>
        <World index={1}>
          <div className={styles.column}>
            <p className={styles.kicker}>Record</p>
            <Bar w={160} h={48} />
            <Bar w={110} h={22} />
            <div className={styles.segs}>
              {Array.from({ length: 6 }, (_, i) => (
                <Bar key={i} h={10} />
              ))}
            </div>
            <dl className={styles.facts}>
              {FACTS.map(fact => (
                <div key={fact}>
                  <dt>{fact}</dt>
                  <dd>
                    <Bar w={40} h={14} />
                  </dd>
                </div>
              ))}
            </dl>
            <div className={styles.calWrap}>
              <div className={styles.cal}>
                {Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => (
                  <Bar key={i} h="auto" style={{ aspectRatio: 1 }} />
                ))}
              </div>
              <p className={styles.calKey}>
                <span>{CALENDAR_WEEKS} weeks</span>
              </p>
            </div>
          </div>
        </World>
        <World index={4}>
          <div className={styles.column}>
            <p className={styles.kicker}>Stamps</p>
            <ul className={styles.stamps} aria-hidden="true">
              {Array.from({ length: STAMPS }, (_, i) => (
                <li key={i}>
                  <Ghost round style={{ width: 64, height: 64 }} />
                  <Bar w={64} h={12} />
                  <Bar w={40} h={10} />
                </li>
              ))}
            </ul>
          </div>
        </World>
      </Worlds>
    </main>
  )
}
