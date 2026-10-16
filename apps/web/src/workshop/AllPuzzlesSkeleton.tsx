import { getAccount } from '../account.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { currentWorkshop } from '../content.ts'
import { localDrafts } from '../make/draft-store.ts'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { useHudTrail } from '../Trail.tsx'
import { FILTERS, SORTS, TRAIL } from './AllPuzzlesPage.tsx'
import { allPuzzles, mergeDrafts } from './workshop.ts'
import homeStyles from '../home/Home.module.css'
import styles from './Workshop.module.css'

/** All puzzles while it loads: its heading and controls as the page has them, inert, and a tile per puzzle last loaded. */
export function AllPuzzlesSkeleton() {
  useAnnounceSkeleton()
  useHudTrail(TRAIL)
  const userId = getAccount().account?.userId
  const workshop = currentWorkshop(userId)
  const count = workshop ? allPuzzles(mergeDrafts(workshop.drafts.puzzles, localDrafts(userId ?? '')), workshop.made).length : 12
  return (
    <main className={styles.page} aria-busy="true">
      <SrLoading />
      <Worlds>
        <World paper="workshop" start>
          <div className={styles.list}>
            <div className={styles.listHead}>
              <Bar w={180} h={14} />
              <h1 className={homeStyles.hero}>All puzzles</h1>
              <div className={styles.controls} inert>
                <input type="search" className={styles.search} placeholder="Search puzzles" aria-hidden="true" />
                <span className={styles.seg}>
                  {FILTERS.map(f => (
                    <button key={f.value} type="button" data-variant="flat" data-size="compact" aria-pressed={f.value === 'all'}>
                      {f.label}
                    </button>
                  ))}
                </span>
                <span className={styles.seg}>
                  {SORTS.map(s => (
                    <button key={s.value} type="button" data-variant="flat" data-size="compact" aria-pressed={s.value === 'newest'}>
                      {s.label}
                    </button>
                  ))}
                </span>
                <button type="button" data-variant="paper">
                  New puzzle
                </button>
              </div>
            </div>
            <ul className={styles.grid}>
              {Array.from({ length: count }, (_, i) => (
                <li key={i}>
                  <Ghost style={{ width: '100%', aspectRatio: 1 }} />
                  <Bar w="70%" h={12} style={{ margin: 'var(--space-1) auto 0' }} />
                </li>
              ))}
            </ul>
          </div>
        </World>
      </Worlds>
    </main>
  )
}
