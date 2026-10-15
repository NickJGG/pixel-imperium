import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { PuzzleSummary } from '@pixel-imperium/protocol'
import { usePrefetch } from '../play/prefetch.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { SlotFace } from './PuzzleSlot.tsx'
import styles from './Campaign.module.css'

interface Props {
  puzzle: PuzzleSummary
  /** 1-based slot number on the province's pages. */
  number: number
  storage: ProgressStorage
  /** The way in, beside the text. A narrow foot leaves it out and sets its own underneath. */
  children?: ReactNode
}

/** The puzzle due next: the foot of the active province's spread, and of Play's rail once solved. */
export function NextUp({ puzzle: p, number, storage, children }: Props) {
  usePrefetch(p.id)
  return (
    <div className={styles.nextUp}>
      <Link to="/play/$id" params={{ id: p.id }} className={styles.nextSlot} tabIndex={-1} aria-hidden="true">
        <SlotFace puzzle={p} number={number} storage={storage} next />
      </Link>
      <div className={styles.nextText}>
        <p className={styles.nextLabel}>Next up</p>
        <p className={styles.nextName}>
          #{number} {p.title}
        </p>
        <p className={styles.nextSize}>
          {p.width}×{p.height}
        </p>
      </div>
      {children}
    </div>
  )
}
