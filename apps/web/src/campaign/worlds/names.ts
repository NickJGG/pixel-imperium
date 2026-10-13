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

/**
 * Play's paper, pairing with the province's column on its page, which widens into it, or with whichever column a
 * door into the board stood in (`data-pair`, as `World`'s), province or not.
 */
export const columnPaper = (provinceId: string | undefined) =>
  provinceId === undefined
    ? { 'data-pair': '', style: { viewTransitionClass: styles.pageColumn } as CSSProperties }
    : { ...boardMorph(`province-${provinceId}`, styles.pageColumn), 'data-pair': '' }

/** A slot on an album page or in a Filmstrip, flying between them. */
export const slotMorph = (puzzleId: string) => ({ ...boardMorph(slotName(puzzleId), 'slot'), 'data-slot': '' })

/**
 * A door into a puzzle's board with no Filmstrip to fly into, as Home's Next up or a Month's day cell. Named only by
 * `morph-nav.ts`, since a page can have two doors into one board, and only the one taken grows. A `cell` gives way
 * to its twin beside it on the way back.
 */
export const doorSlot = (puzzleId: string, cell = false) => ({
  'data-door': slotName(puzzleId),
  ...(cell && { 'data-cell': '' }),
})

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

/**
 * Props naming a puzzle's Dymo label on the rail, for a step to the next puzzle alone (`next-board`): each puzzle's
 * is its own, so the old one peels off as the new one sticks on.
 */
export const dymoMorph = (puzzleId: string) => ({
  'data-dymo': '',
  style: { '--dymo': `dymo-${puzzleId}`, viewTransitionClass: 'dymo' } as CSSProperties,
})

/** The element wearing `name` in a board morph, if it's on the page and named. */
export const named = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[data-morph]:not([data-unseen])')].find(
    el => el.style.getPropertyValue('--morph') === name,
  )

const onScreen = (el: HTMLElement) => {
  const { left, top, right, bottom } = el.getBoundingClientRect()
  return right > left && left < innerWidth && right > 0 && top < innerHeight && bottom > 0
}

/**
 * The slot on the page a door morph grows from or shrinks into, for the board `name`: the one in or around the link
 * `clicked` is in, else one that isn't a calendar cell. A province's own slots count too, for a phone, where its page has no
 * Filmstrip to fly to.
 */
export function doorOf(name: string, clicked: EventTarget | null): HTMLElement | undefined {
  const doors = [...document.querySelectorAll<HTMLElement>(`[data-door="${CSS.escape(name)}"]`), named(name)].filter(
    (el): el is HTMLElement => el !== undefined && onScreen(el),
  )
  const link = clicked instanceof Element ? clicked.closest('a') : null
  return (
    doors.find(el => link && (link.contains(el) || el.contains(link))) ??
    doors.find(el => !el.hasAttribute('data-cell')) ??
    doors[0]
  )
}
