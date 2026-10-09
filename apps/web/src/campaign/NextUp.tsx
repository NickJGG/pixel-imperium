import { Link } from '@tanstack/react-router'
import type { PuzzleSummary } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'
import playStyles from '../play/Play.module.css'
import { SlotFace } from './PuzzleSlot.tsx'
import styles from './Campaign.module.css'

interface Props {
  puzzle: PuzzleSummary
  /** 1-based slot number on the province's pages. */
  number: number
  storage: ProgressStorage
  /** Nothing solved yet anywhere in the campaign. */
  fresh: boolean
}

/** The puzzle due next, for the foot of the active province's spread. */
export function NextUp({ puzzle: p, number, storage, fresh }: Props) {
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
      <Link to="/play/$id" params={{ id: p.id }} className={playStyles.linkButton}>
        {fresh ? 'Start' : 'Continue'}
      </Link>
    </div>
  )
}
