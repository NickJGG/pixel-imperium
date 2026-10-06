import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { PuzzleSummary } from '@pixel-imperium/protocol'
import { LoopIcon } from '../play/ClearButton.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { PixelArt } from './PixelArt.tsx'
import styles from './Campaign.module.css'

type Status =
  /**
   * `replay` is the replay's percent while a solved puzzle is being played again;
   * `unverified` marks an imported solve the server could not check.
   */
  | { kind: 'solved'; palette: (string | null)[] | null; replay: number | null; unverified: boolean }
  | { kind: 'started'; percent: number }
  | { kind: 'new' }

function statusOf(p: PuzzleSummary, storage: ProgressStorage): Status {
  const length = p.width * p.height
  const percent = progressPercent(storage.loadProgress(p.id, length) ?? [], p.filledCount, false)
  const solved = storage.loadSolved(p.id)
  if (solved) {
    return {
      kind: 'solved',
      palette: storage.loadPalette(p.id, length),
      replay: storage.loadReplay(p.id) ? percent : null,
      unverified: solved === 'unverified',
    }
  }
  return percent > 0 ? { kind: 'started', percent } : { kind: 'new' }
}

export function PuzzleCard({ puzzle: p, storage }: { puzzle: PuzzleSummary; storage: ProgressStorage }) {
  const status = statusOf(p, storage)
  return (
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
      {status.kind === 'solved' && status.replay !== null ? (
        <span className={`${styles.sticker} ${styles.split}`} title="Replaying">
          <span>Solved</span>
          <span>
            <LoopIcon />
            {status.replay}%
          </span>
        </span>
      ) : (
        <span className={`${styles.sticker} ${styles[status.kind]}`}>
          {status.kind === 'solved' ? 'Solved' : status.kind === 'started' ? `${status.percent}%` : 'New'}
        </span>
      )}
      <div className={styles.info}>
        <span className={styles.title}>{p.title}</span>
        <span className={styles.size}>
          {p.width}×{p.height}
        </span>
      </div>
      {status.kind === 'solved' && status.unverified && <span className={styles.note}>Imported — replay to verify</span>}
    </Link>
  )
}
