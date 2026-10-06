import type { CSSProperties } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { loadProgress, loadSolved } from '../play/progress-storage.ts'
import styles from './PuzzleList.module.css'

const route = getRouteApi('/')

export function PuzzleList() {
  const puzzles = route.useLoaderData()
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>All puzzles</h1>
      <ul className={styles.grid}>
        {puzzles.map(p => {
          const status = loadSolved(p.id)
            ? 'solved'
            : loadProgress(p.id, p.width * p.height)?.some(c => c !== 'empty')
              ? 'started'
              : null
          return (
            <li key={p.id}>
              <Link to="/play/$id" params={{ id: p.id }} className={styles.card}>
                <div className={status ? `${styles.thumb} ${styles[status]}` : styles.thumb}>
                  <div
                    className={styles.blank}
                    style={{ '--w': p.width, '--h': p.height } as CSSProperties}
                    aria-hidden="true"
                  />
                </div>
                {status && (
                  <span className={`${styles.sticker} ${styles[status]}`}>
                    {status === 'solved' ? 'Solved' : 'In progress'}
                  </span>
                )}
                <div className={styles.info}>
                  <span className={styles.title}>{p.title}</span>
                  <span className={styles.size}>
                    {p.width}×{p.height}
                  </span>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </main>
  )
}
