/**
 * The view-transition names the board morphs pair across pages, so the album pages, Play and their skeletons agree.
 * Only a board morph wears them (`board-morph.css`); every other transition passes over these elements.
 */
import type { CSSProperties } from 'react'
import styles from './Worlds.module.css'

/** A puzzle's slot wherever it stands, and its board while it's played. */
export const slotName = (puzzleId: string) => `slot-${puzzleId}`

/** Props naming an element for the board morphs; `cls` is its view-transition class. */
export const boardMorph = (name: string, cls?: string) => ({
  'data-morph': '',
  style: { '--morph': name, ...(cls && { viewTransitionClass: cls }) } as CSSProperties,
})

/** Play's paper, pairing with the province's column on its page, which widens into it. */
export const columnPaper = (provinceId: string) => boardMorph(`province-${provinceId}`, styles.pageColumn)

/** A slot on an album page or in a Filmstrip, flying between them. */
export const slotMorph = (puzzleId: string) => boardMorph(slotName(puzzleId), 'slot')

/**
 * Unnames the slots a scrolled strip hides, so their partners fade with the page instead of flying to where they
 * can't be seen.
 */
export function markUnseen(list: HTMLElement): void {
  const top = list.scrollTop
  const bottom = top + list.clientHeight
  for (const item of list.children as HTMLCollectionOf<HTMLElement>)
    item.toggleAttribute('data-unseen', item.offsetTop < top || item.offsetTop + item.offsetHeight > bottom)
}
