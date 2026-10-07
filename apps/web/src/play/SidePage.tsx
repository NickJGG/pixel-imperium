import type { Ref, RefCallback } from 'react'
import type { Province } from '@pixel-imperium/protocol'
import { paperStyle } from '../album/paper.ts'
import { Slot } from '../album/Slot.tsx'
import { pageOf } from '../album/Spread.tsx'
import { Stamp } from '../album/Stamp.tsx'
import { GOLD_SLOT, PuzzleSlot } from '../campaign/PuzzleSlot.tsx'
import { SIDE_PAGE_WIDTH } from './layout.ts'
import type { ProgressStorage } from './progress-storage.ts'
import styles from './Play.module.css'

const ROW = 5

interface Props {
  province: Province
  /** The province's place in its campaign, for its paper and page number. */
  index: number
  /** The puzzle being played, 1-based on the province's pages. */
  number: number
  storage: ProgressStorage
  /** Keeps the puzzle's slot empty while its sticker is on its way. */
  hideSticker: boolean
  stamped: boolean
  ref: Ref<HTMLElement>
  slotRef: RefCallback<HTMLElement>
}

/** The row of five slots holding the puzzle being played, cut from its province's page. */
export function SidePage({ province, index, number, storage, hideSticker, stamped, ref, slotRef }: Props) {
  const first = Math.floor((number - 1) / ROW) * ROW
  const current = province.puzzles[number - 1]!
  const has = (id: string) => storage.loadSolved(id) !== null && !(hideSticker && id === current.id)
  const solved = province.puzzles.filter(p => has(p.id)).length

  return (
    <aside
      ref={ref}
      className={styles.side}
      style={{ ...paperStyle(index), width: SIDE_PAGE_WIDTH }}
      aria-label={`${province.name}, page ${pageOf(index, number)}`}
    >
      <header className={styles.sideHead}>
        <div>
          <h2>{province.name}</h2>
          <p>p. {pageOf(index, number)}</p>
        </div>
        <span className={styles.count}>
          {solved} / {province.puzzles.length}
        </span>
      </header>
      <ol className={styles.sideSlots} start={first + 1}>
        {province.puzzles.slice(first, first + ROW).map((p, i) => (
          <li key={p.id} ref={p === current ? slotRef : undefined}>
            {p === current && !has(p.id) ? (
              <Slot number={number} width={p.width} height={p.height} gold={number === GOLD_SLOT} next />
            ) : (
              <PuzzleSlot puzzle={p} number={first + i + 1} storage={storage} />
            )}
          </li>
        ))}
      </ol>
      {stamped && (
        <Stamp thunk solid className={styles.sideStamp}>
          New sticker!
        </Stamp>
      )}
    </aside>
  )
}
