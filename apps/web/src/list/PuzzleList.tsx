import type { CSSProperties } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { PuzzleSummary } from '@pixel-imperium/protocol'
import { loadPalette, loadProgress, loadSolved } from '../play/progress-storage.ts'
import { PixelArt } from './PixelArt.tsx'
import styles from './PuzzleList.module.css'

const route = getRouteApi('/')

type Filter = 'open' | 'solved' | undefined

const FILTERS: [Filter, string][] = [
  [undefined, 'All'],
  ['open', 'To solve'],
  ['solved', 'Solved'],
]

const EMPTY: Record<NonNullable<Filter>, string> = {
  open: 'All solved — nice.',
  solved: 'Nothing solved yet.',
}

type Status = { kind: 'solved'; palette: (string | null)[] | null } | { kind: 'started'; percent: number } | { kind: 'new' }

function statusOf(p: PuzzleSummary): Status {
  const length = p.width * p.height
  if (loadSolved(p.id)) return { kind: 'solved', palette: loadPalette(p.id, length) }
  const percent = progressPercent(loadProgress(p.id, length) ?? [], p.filledCount, false)
  return percent > 0 ? { kind: 'started', percent } : { kind: 'new' }
}

export function PuzzleList() {
  const puzzles = route.useLoaderData()
  const { filter } = route.useSearch()
  const navigate = route.useNavigate()

  const shown = puzzles
    .map(p => ({ p, status: statusOf(p) }))
    .filter(({ status }) => !filter || (filter === 'solved') === (status.kind === 'solved'))

  return (
    <main className={styles.page}>
      <div className={styles.sec}>
        <h1 className={styles.heading}>All puzzles</h1>
        <div className={styles.filters} role="group" aria-label="Filter">
          {FILTERS.map(([value, label]) => (
            <button
              key={label}
              type="button"
              aria-pressed={filter === value}
              onClick={() => navigate({ search: value ? { filter: value } : {}, replace: true })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {filter && shown.length === 0 ? (
        <p className={styles.empty}>{EMPTY[filter]}</p>
      ) : (
        <ul className={styles.grid}>
          {shown.map(({ p, status }) => (
            <li key={p.id}>
              <Link to="/play/$id" params={{ id: p.id }} className={styles.card}>
                <div className={`${styles.thumb} ${styles[status.kind]}`}>
                  {status.kind === 'solved' && status.palette ? (
                    <PixelArt title={p.title} width={p.width} height={p.height} palette={status.palette} />
                  ) : (
                    <div
                      className={`${styles.box} ${styles.blank}`}
                      style={{ '--w': p.width, '--h': p.height } as CSSProperties}
                      aria-hidden="true"
                    />
                  )}
                </div>
                <span className={`${styles.sticker} ${styles[status.kind]}`}>
                  {status.kind === 'solved' ? 'Solved' : status.kind === 'started' ? `${status.percent}%` : 'New'}
                </span>
                <div className={styles.info}>
                  <span className={styles.title}>{p.title}</span>
                  <span className={styles.size}>
                    {p.width}×{p.height}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
