import type { ReactNode, Ref, RefCallback } from 'react'
import { Link } from '@tanstack/react-router'
import type { Province } from '@pixel-imperium/protocol'
import { paperStyle } from '../album/paper.ts'
import { Slot } from '../album/Slot.tsx'
import { GOLD_SLOT, PuzzleSlot } from '../campaign/PuzzleSlot.tsx'
import { SIDE_PAGE_WIDTH } from './layout.ts'
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
  campaignId: string
  /** The province's place in its campaign, for its paper colour. */
  index: number
  /** Hangs off the panel's edge: New sticker!, or the conquest's. */
  stamp: ReactNode
  /** A status beside the size: Replaying, Imported and the like. */
  tag: ReactNode
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
            <Slot number={number} width={p.width} height={p.height} gold={number === GOLD_SLOT} next />
          ) : (
            <PuzzleSlot puzzle={p} number={first + i + 1} storage={storage} />
          )}
        </li>
      ))}
    </ol>
  )
}

/**
 * The puzzle's panel beside the board, on its province's paper: the way back, the puzzle, and the
 * row of five slots it sits in, then whatever the play state puts under them.
 */
export function PuzzlePanel({ campaignId, index, stamp, tag, children, ref, ...row }: Props) {
  const { province, number } = row
  const current = province.puzzles[number - 1]!
  const has = stuck(row)
  const solved = province.puzzles.filter(p => has(p.id)).length

  return (
    <aside
      ref={ref}
      className={styles.panel}
      style={{ ...paperStyle(index), width: SIDE_PAGE_WIDTH }}
      aria-label={province.name}
    >
      <div className={styles.panelBack}>
        <Link to="/c/$campaignId/$provinceId" params={{ campaignId, provinceId: province.id }}>
          ← {province.name}
        </Link>
        <span className={styles.count}>
          {solved} / {province.puzzles.length}
        </span>
      </div>
      <header className={styles.panelHead}>
        <h1 className={styles.title}>
          #{number} {current.title}
        </h1>
        <span className={styles.size}>
          {current.width}×{current.height}
        </span>
        {tag}
      </header>
      <SlotRow {...row} />
      {children}
      {stamp}
    </aside>
  )
}
