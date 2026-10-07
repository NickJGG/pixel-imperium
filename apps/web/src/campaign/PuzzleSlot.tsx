import { Link } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { PuzzleSummary } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { Slot } from '../album/Slot.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { LoopIcon } from '../play/ClearButton.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'
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

export const GOLD_SLOT = 30

interface Props {
  puzzle: PuzzleSummary
  /** 1-based position on the province's pages. */
  number: number
  storage: ProgressStorage
  /** The lowest unsolved slot in the active province. */
  next?: boolean
}

/** A puzzle's slot on its province's spread: its sticker once solved, else an empty slot. Opens the puzzle. */
export function PuzzleSlot({ puzzle: p, number, storage, next = false }: Props) {
  const status = statusOf(p, storage)
  const gold = number === GOLD_SLOT
  const size = `${p.width}×${p.height}`
  const label =
    status.kind === 'solved'
      ? `${number}: ${p.title}, ${status.unverified ? 'imported, replay to verify' : 'solved'}${status.replay === null ? '' : `, replaying ${status.replay}%`}`
      : `${number}: ${size}${status.kind === 'started' ? `, ${status.percent}% done` : ''}${next ? ', up next' : ''}`

  return (
    <Link
      to="/play/$id"
      params={{ id: p.id }}
      className={styles.slotLink}
      aria-label={label}
      title={status.kind === 'solved' && status.unverified ? 'Imported: replay to verify' : undefined}
    >
      {status.kind === 'solved' ? (
        <Slot number={number} width={p.width} height={p.height}>
          <Sticker
            title={p.title}
            width={p.width}
            height={p.height}
            palette={status.palette ?? Array<null>(p.width * p.height).fill(null)}
            gold={gold}
            unverified={status.unverified}
            tilt={tiltOf(p.id)}
          />
          {status.replay !== null && (
            <Dymo className={styles.replay}>
              <LoopIcon />
              {status.replay}%
            </Dymo>
          )}
        </Slot>
      ) : (
        <Slot
          number={number}
          width={p.width}
          height={p.height}
          started={status.kind === 'started' ? status.percent : undefined}
          next={next}
          gold={gold}
        />
      )}
    </Link>
  )
}
