import type { ReactNode, Ref, RefCallback } from 'react'
import type { Province } from '@pixel-imperium/protocol'
import { paperStyle } from '../album/paper.ts'
import { Slot } from '../album/Slot.tsx'
import { GOLD_SLOT, PuzzleSlot } from '../campaign/PuzzleSlot.tsx'
import type { ProgressStorage } from './progress-storage.ts'
import styles from './Play.module.css'

const ROW = 5

interface RowProps {
  province: Province
  /** The puzzle being played, 1-based on the province's pages. */
  number: number
  storage: ProgressStorage
  /** Keeps the puzzle's slot empty while its sticker is on its way. */
  hideSticker: boolean
  slotRef?: RefCallback<HTMLElement>
}

interface Props extends RowProps {
  /** The province's place in its campaign, for its paper colour. */
  index: number
  /** Hangs off the panel's edge: New sticker!, or the conquest's. */
  stamp: ReactNode
  /** Everything under the slot row. */
  children: ReactNode
  ref: Ref<HTMLElement>
  slotRef: RefCallback<HTMLElement>
}

const stuck = ({ province, number, storage, hideSticker }: RowProps) => {
  const current = province.puzzles[number - 1]!
  return (id: string) => storage.loadSolved(id) !== null && !(hideSticker && id === current.id)
}

/** The row of five slots the puzzle sits in, as on its province's page. */
export function SlotRow(props: RowProps) {
  const { province, number, storage, slotRef } = props
  const first = Math.floor((number - 1) / ROW) * ROW
  const current = province.puzzles[number - 1]!
  const has = stuck(props)
  return (
    <ol className={styles.panelSlots} start={first + 1}>
      {province.puzzles.slice(first, first + ROW).map((p, i) => (
        <li key={p.id} ref={p === current ? slotRef : undefined}>
          {p === current && !has(p.id) ? (
            <Slot number={number} width={p.width} height={p.height} gold={number === GOLD_SLOT} tier={p.tier} next />
          ) : (
            <PuzzleSlot puzzle={p} number={first + i + 1} storage={storage} />
          )}
        </li>
      ))}
    </ol>
  )
}

/** The province and how much of it is stuck in, over the page sheet's slot row. */
export function PageHead(props: RowProps) {
  const { province } = props
  const has = stuck(props)
  return (
    <div className={styles.pageHead}>
      {province.name}
      <span className={styles.count}>
        {province.puzzles.filter(p => has(p.id)).length} / {province.puzzles.length}
      </span>
    </div>
  )
}

/** The rail beside the board, on its province's paper: the row of five slots, then whatever the play state puts under it. */
export function PuzzlePanel({ index, stamp, children, ref, ...row }: Props) {
  return (
    <aside ref={ref} className={styles.panel} data-pad-panel style={paperStyle(index)} aria-label={row.province.name}>
      <SlotRow {...row} />
      {children}
      {stamp}
    </aside>
  )
}
