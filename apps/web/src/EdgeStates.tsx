import type { ReactNode } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { paperStyle } from './album/paper.ts'
import styles from './EdgeStates.module.css'

/** A missing campaign, province, puzzle, player or page: a torn page with the way back. */
export function NotFound({ children }: { children: ReactNode }) {
  return (
    <main className={styles.page}>
      <section className={`${styles.state} ${styles.paper}`} style={paperStyle(3)} aria-labelledby="missing-title">
        <div className={styles.torn} aria-hidden="true" />
        <p className={styles.label}>404</p>
        <h1 id="missing-title" className={styles.title}>
          This page fell out of the album
        </h1>
        <p>{children}</p>
        <Link to="/" className={styles.back} data-variant="paper">
          Back home
        </Link>
      </section>
    </main>
  )
}

export function LoadError({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <main className={styles.page}>
      <section className={styles.state} aria-labelledby="error-title">
        <p className={styles.label}>Error</p>
        <h1 id="error-title" className={styles.title}>
          The album’s stuck shut
        </h1>
        <p>We couldn’t load this page. Your stickers are safe on this device.</p>
        <p className={styles.detail}>{error instanceof Error ? error.message : String(error)}</p>
        <button type="button" data-variant="primary" onClick={() => void router.invalidate()}>
          Try again
        </button>
      </section>
    </main>
  )
}
