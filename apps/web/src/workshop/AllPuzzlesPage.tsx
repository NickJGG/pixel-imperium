import { useMemo, useState } from 'react'
import { useAccount } from '../account.ts'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { localDrafts } from '../make/draft-store.ts'
import { useHudTrail } from '../Trail.tsx'
import { ALL_PUZZLES_TRAIL } from '../trails.ts'
import { NewPuzzleLink } from './Columns.tsx'
import { PuzzleTile } from './Shelf.tsx'
import { type PuzzleFilter, type PuzzleSort, type Workshop, allPuzzles, findPuzzles, mergeDrafts } from './workshop.ts'
import homeStyles from '../home/Home.module.css'
import styles from './Workshop.module.css'

export const FILTERS: { value: PuzzleFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'retired', label: 'Retired' },
]

export const SORTS: { value: PuzzleSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'size', label: 'Size' },
]

/** Every puzzle of the Author's, drafts, published and retired, to search, filter and sort. */
export function AllPuzzlesPage({ workshop }: { workshop: Workshop }) {
  useHudTrail(ALL_PUZZLES_TRAIL)
  const { account } = useAccount()
  const [local] = useState(() => localDrafts(account?.userId ?? ''))
  const entries = useMemo(() => allPuzzles(mergeDrafts(workshop.drafts.puzzles, local), workshop.made), [workshop, local])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PuzzleFilter>('all')
  const [sort, setSort] = useState<PuzzleSort>('newest')
  const found = findPuzzles(entries, { query, filter, sort })

  return (
    <main className={styles.page}>
      <Worlds>
        <World paper="workshop" labelledBy="all-puzzles" start>
          <div className={styles.list}>
            <div className={styles.listHead}>
              <p className={homeStyles.kicker}>Workshop · {entries.length} puzzles</p>
              <h1 id="all-puzzles" className={homeStyles.hero}>
                All puzzles
              </h1>
              <div className={styles.controls}>
                <input
                  type="search"
                  className={styles.search}
                  placeholder={`Search ${entries.length} puzzles`}
                  aria-label="Search by title"
                  value={query}
                  onChange={e => setQuery(e.currentTarget.value)}
                />
                <span className={styles.seg} role="group" aria-label="Show">
                  {FILTERS.map(f => (
                    <button
                      key={f.value}
                      type="button"
                      data-variant="flat"
                      data-size="compact"
                      aria-pressed={filter === f.value}
                      onClick={() => setFilter(f.value)}
                    >
                      {f.label}
                    </button>
                  ))}
                </span>
                <span className={styles.seg} role="group" aria-label="Sort">
                  {SORTS.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      data-variant="flat"
                      data-size="compact"
                      aria-pressed={sort === s.value}
                      onClick={() => setSort(s.value)}
                    >
                      {s.label}
                    </button>
                  ))}
                </span>
                <NewPuzzleLink />
              </div>
            </div>
            {found.length > 0 ? (
              <ul className={styles.grid}>
                {found.map(e => (
                  <li key={e.kind === 'draft' ? e.id : e.puzzle.id}>
                    <PuzzleTile entry={e} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className={styles.empty}>{entries.length === 0 ? 'No puzzles yet.' : 'No puzzles match.'}</p>
            )}
          </div>
        </World>
      </Worlds>
    </main>
  )
}
