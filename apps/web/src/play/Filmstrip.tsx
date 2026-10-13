import { type RefCallback, useLayoutEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import type { Province } from '@pixel-imperium/protocol'
import { Slot } from '../album/Slot.tsx'
import { GOLD_SLOT, PuzzleSlot, SlotFace } from '../campaign/PuzzleSlot.tsx'
import { boardMorph, markUnseen, slotMorph } from '../campaign/worlds/names.ts'
import { CrownMark } from '../Hud.tsx'
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

interface FilmProps extends RowProps {
  /** The sticker has just landed in the current slot. */
  glow?: boolean
}

/**
 * The province's slots down the left of Play, topped by the crown mark and the count. It scrolls, and opens with
 * the current slot centred and ringed; `slotRef` is that slot, where the sticker flies.
 */
export function Filmstrip(props: FilmProps) {
  const { province, number, storage, slotRef, glow } = props
  const current = province.puzzles[number - 1]!
  const has = stuck(props)
  const { listRef, currentRef } = useCentredFilm()

  return (
    <nav className={styles.film} aria-label={`${province.name} puzzles`} {...boardMorph('film', 'film')}>
      <Link to="/" className={styles.filmMark} aria-label="Pixel Imperium">
        <CrownMark />
      </Link>
      <p className={styles.filmHead}>
        <span>
          {province.puzzles.filter(p => has(p.id)).length} / {province.puzzles.length}
        </span>
      </p>
      <ol ref={listRef} className={styles.filmSlots} onScroll={e => markUnseen(e.currentTarget)}>
        {province.puzzles.map((p, i) =>
          p === current ? (
            <li key={p.id} ref={currentRef} className={styles.filmCurrent} aria-current="page" data-glow={glow || undefined}>
              <span ref={slotRef} className={styles.filmSlot}>
                {has(p.id) ? (
                  <SlotFace puzzle={p} number={number} storage={storage} />
                ) : (
                  <Slot number={number} width={p.width} height={p.height} gold={number === GOLD_SLOT} tier={p.tier} next />
                )}
              </span>
            </li>
          ) : (
            <li key={p.id} {...slotMorph(p.id)}>
              <PuzzleSlot puzzle={p} number={i + 1} storage={storage} />
            </li>
          ),
        )}
      </ol>
    </nav>
  )
}

/**
 * Opens a strip with its current slot centred, its slots out of view unnamed for the board morphs (`markUnseen`).
 */
export function useCentredFilm() {
  const listRef = useRef<HTMLOListElement>(null)
  const currentRef = useRef<HTMLLIElement>(null)
  useLayoutEffect(() => {
    const list = listRef.current!
    const item = currentRef.current!
    list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2
    markUnseen(list)
  }, [])
  return { listRef, currentRef }
}
