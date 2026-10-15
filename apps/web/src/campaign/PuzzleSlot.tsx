import { Link } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { PuzzleSummary } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { Slot } from '../album/Slot.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { LoopIcon } from '../play/ClearButton.tsx'
import { prefetchOn } from '../play/prefetch.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import styles from './Campaign.module.css'

type Status =
  /**
   * `replay` is the replay's percent while a solved puzzle is being played again;
   * `unverified` marks an imported solve the server could not check.
   */
  | { kind: 'solved'; palette: (string | null)[] | null; replay: number | null; unverified: boolean; foil: boolean }
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
      foil: storage.loadFoil(p.id),
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
  /** Where a controller's focus lands on the page. */
  padDefault?: boolean
}

/** A puzzle's slot on its province's spread: its sticker once solved, else an empty slot. Opens the puzzle. */
export function PuzzleSlot({ puzzle: p, number, storage, next = false, padDefault = false }: Props) {
  const status = statusOf(p, storage)
  const size = `${p.width}×${p.height}`
  const label =
    status.kind === 'solved'
      ? `${number}: ${p.title}, ${status.unverified ? 'imported, replay to verify' : status.foil ? 'foil' : 'solved'}${status.replay === null ? '' : `, replaying ${status.replay}%`}`
      : `${number}: ${size}${p.tier ? `, ${p.tier}` : ''}${status.kind === 'started' ? `, board in progress, ${status.percent}% done` : ''}${next ? ', up next' : ''}`

  return (
    <Link
      to="/play/$id"
      params={{ id: p.id }}
      className={styles.slotLink}
      {...prefetchOn(p.id)}
      data-pad-default={padDefault || undefined}
      aria-label={label}
      title={status.kind === 'solved' && status.unverified ? 'Imported: replay to verify' : undefined}
    >
      <SlotFace puzzle={p} number={number} status={status} next={next} storage={storage} />
    </Link>
  )
}

/** What fills a puzzle's slot: its sticker once solved, else the empty slot with its started board. */
export function SlotFace({
  puzzle: p,
  number,
  storage,
  next = false,
  status = statusOf(p, storage),
}: {
  puzzle: PuzzleSummary
  number: number
  storage: ProgressStorage
  next?: boolean
  status?: Status
}) {
  const gold = number === GOLD_SLOT
  return status.kind === 'solved' ? (
    <Slot number={number} width={p.width} height={p.height}>
      <Sticker
        title={p.title}
        width={p.width}
        height={p.height}
        palette={status.palette ?? Array<null>(p.width * p.height).fill(null)}
        gold={gold}
        foil={status.foil}
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
      cells={status.kind === 'started' ? (storage.loadCells(p.id) ?? undefined) : undefined}
      next={next}
      gold={gold}
      tier={p.tier}
    />
  )
}
