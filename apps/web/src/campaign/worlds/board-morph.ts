/**
 * The part of `to-board` / `from-board` that hangs on which slot was clicked, over what every slot shares
 * (`board-morph.css`). The clicked slot grows into the board, or the board shrinks home into it, by a sheet written
 * for that one transition; the other slots set off in a ripple out from it, each after the ones nearer.
 * The ripple holds each slot's animations paused on their first frame until its turn: an `animation-delay` on a
 * transition's pseudo-elements leaves them out of place while they wait.
 *
 * `next-board`, a step between two puzzles of a province, takes a path no pair of boxes can: the board shrinks in
 * place to a sticker, files into its slot in the Filmstrip and squashes as it lands, while the next slot lifts out,
 * flies to the middle and opens into the board. Script drives both, by keyframes measured from the two pages.
 */
import { named, slotName } from './names.ts'

/** Between one slot setting off and the next one out. */
export const RIPPLE_MS = 45

/** The longest the ripple may run, closing the steps up on a big province. */
export const RIPPLE_CAP_MS = 400

/** How long each slot in `order` waits to set off, by id: the clicked one at once, the rest by their distance from it. */
export function rippleDelays(order: readonly string[], clicked: string): Map<string, number> {
  const at = order.indexOf(clicked)
  if (at === -1) return new Map()
  const reach = Math.max(at, order.length - 1 - at)
  const step = reach === 0 ? 0 : Math.min(RIPPLE_MS, RIPPLE_CAP_MS / reach)
  return new Map(order.map((id, i) => [id, Math.round(Math.abs(i - at) * step)]))
}

/** The sheet for one board morph between the `clicked` slot and its board, `back` from the board to the slot. */
export function boardSheet(clicked: string, back: boolean): string {
  const board = `slot-${clicked}`
  // The board fades in once it has grown past the slot; on the way back it stays until it has nearly shrunk home.
  const [slotSide, boardSide] = back ? ['new', 'old'] : ['old', 'new']
  return [
    `:root::view-transition-group(${board}) {\n  z-index: 4 !important;\n}`,
    `:root::view-transition-image-pair(${board}) {\n  overflow: visible !important;\n  animation-name: none !important;\n}`,
    `:root::view-transition-${slotSide}(${board}) {\n  animation-name: ${back ? 'board-slot-in' : 'board-slot-out'} !important;\n  mix-blend-mode: normal !important;\n}`,
    `:root::view-transition-${boardSide}(${board}) {\n  animation-name: ${back ? 'board-out' : 'board-in'} !important;\n  mix-blend-mode: normal !important;\n}`,
  ].join('\n\n')
}

const SLOT_PSEUDO = /^::view-transition-([a-z-]+)\(slot-(.+)\)$/

/**
 * Holds every slot's animations on their first frame until their turn in `delays`; returns the ripple's cancel. A
 * slot with no partner to fly to fades with the column instead (`board-morph.css`), so it doesn't wait.
 */
function ripple(delays: ReadonlyMap<string, number>): () => void {
  const slots = new Map<string, { parts: Set<string>; animations: Animation[] }>()
  for (const animation of document.getAnimations()) {
    const { effect } = animation
    if (!(effect instanceof KeyframeEffect) || effect.target !== document.documentElement) continue
    const [, part, id] = SLOT_PSEUDO.exec(effect.pseudoElement ?? '') ?? []
    if (!part || !id) continue
    const slot = slots.get(id) ?? { parts: new Set(), animations: [] }
    slot.parts.add(part)
    slot.animations.push(animation)
    slots.set(id, slot)
  }
  const timers: ReturnType<typeof setTimeout>[] = []
  for (const [id, { parts, animations }] of slots) {
    const delay = delays.get(id) ?? 0
    if (delay === 0 || !parts.has('old') || !parts.has('new')) continue
    for (const animation of animations) {
      animation.pause()
      timers.push(setTimeout(() => animation.play(), delay))
    }
  }
  return () => timers.forEach(clearTimeout)
}

/** Plays the board morph's per-slot part over `transition`; returns its cleanup, for when the transition ends. */
export function startBoardMorph(
  transition: ViewTransition,
  order: readonly string[],
  clicked: string,
  back: boolean,
): () => void {
  const sheet = document.head.appendChild(document.createElement('style'))
  sheet.textContent = boardSheet(clicked, back)
  let cancel = () => {}
  transition.ready.then(() => (cancel = ripple(rippleDelays(order, clicked))), () => {})
  return () => {
    cancel()
    sheet.remove()
  }
}

/** A box on the page, where a transition's group stands. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** How long `next-board` plays. */
export const NEXT_MS = 1500

/** When the next slot lifts out, as a fraction of `NEXT_MS`: while the last board is still flying home. */
export const LIFT_AT = 0.4

/** A box of `size`'s size, centred where `at` is. */
export const centredOn = (at: Box, size: Box): Box => ({
  x: at.x + at.w / 2 - size.w / 2,
  y: at.y + at.h / 2 - size.h / 2,
  w: size.w,
  h: size.h,
})

/** One board's keyframes: its group's box, its image pair's peel, and the crossfade of its two sides. */
export interface BoardKeyframes {
  group: Keyframe[]
  pair: Keyframe[]
  old: Keyframe[]
  new: Keyframe[]
}

const place = (box: Box, offset: number): Keyframe => ({
  transform: `translate(${box.x}px, ${box.y}px)`,
  width: `${box.w}px`,
  height: `${box.h}px`,
  offset,
  easing: 'ease-in-out',
})

const FLAT = { transform: 'scale(1) rotate(0deg)', filter: 'drop-shadow(0 0 0 rgb(0 0 0 / 0))' }
const PEEL = { transform: 'scale(1.3) rotate(-7deg)', filter: 'drop-shadow(0 10px 8px rgb(0 0 0 / 0.45))' }

/** The old side giving way to the new between `start` and `end`. */
const swap = (start: number, end: number) => ({
  old: [
    { opacity: 1, offset: 0 },
    { opacity: 1, offset: start },
    { opacity: 0, offset: end },
    { opacity: 0, offset: 1 },
  ],
  new: [
    { opacity: 0, offset: 0 },
    { opacity: 0, offset: start },
    { opacity: 1, offset: end },
    { opacity: 1, offset: 1 },
  ],
})

/** The board leaving: shrinks in place to its slot's size, peels up and flies into the slot, and squashes as it lands. */
export function fileKeyframes(board: Box, slot: Box): BoardKeyframes {
  return {
    group: [place(board, 0), place(centredOn(board, slot), 0.25), place(slot, 0.55), place(slot, 1)],
    pair: [
      { ...FLAT, offset: 0 },
      { ...FLAT, offset: 0.25 },
      { ...PEEL, offset: 0.4 },
      { ...FLAT, offset: 0.55 },
      { transform: 'scale(0.86) rotate(0deg)', offset: 0.61 },
      { transform: 'scale(1.08) rotate(0deg)', offset: 0.67 },
      { ...FLAT, offset: 0.73 },
      { ...FLAT, offset: 1 },
    ],
    ...swap(0.14, 0.25),
  }
}

/** The next slot: peels out at `LIFT_AT`, flies to the board's middle at its own size, and opens out, clues last. */
export function liftKeyframes(slot: Box, board: Box): BoardKeyframes {
  const fly = LIFT_AT + 0.2
  const grow = fly + 0.05
  const middle = centredOn(board, slot)
  return {
    group: [place(slot, 0), place(slot, LIFT_AT), place(middle, fly), place(middle, grow), place(board, 1)],
    pair: [
      { ...FLAT, offset: 0 },
      { ...FLAT, offset: LIFT_AT },
      { ...PEEL, offset: LIFT_AT + 0.1 },
      { ...FLAT, offset: fly },
      { ...FLAT, offset: 1 },
    ],
    ...swap(grow + 0.05, grow + 0.15),
  }
}

/** Hands a driven board's pseudo-elements to script: no animations of their own, and both sides filling the group. */
export function drivenSheet(name: string, z: number): string {
  return [
    `:root::view-transition-group(${name}) {\n  z-index: ${z} !important;\n  animation: none !important;\n}`,
    `:root::view-transition-image-pair(${name}) {\n  overflow: visible !important;\n  animation: none !important;\n}`,
    `:root::view-transition-old(${name}),\n:root::view-transition-new(${name}) {\n  left: 0 !important;\n  translate: none !important;\n  width: 100% !important;\n  height: 100% !important;\n  mix-blend-mode: normal !important;\n  animation: none !important;\n}`,
  ].join('\n\n')
}

const boxOf = (el: HTMLElement | undefined): Box | undefined => {
  if (!el) return undefined
  const { left, top, width, height } = el.getBoundingClientRect()
  return { x: left, y: top, w: width, h: height }
}

/**
 * Plays `next-board`'s two boards over `transition`, from puzzle `from` to `to`; returns its cleanup. Called as the
 * transition starts, while the old page still stands, which it measures; the new one is measured once it's captured.
 * A board without both sides on show, as a slot scrolled out of the strip, keeps the stylesheet's crossfade.
 */
export function startNextBoard(transition: ViewTransition, from: string, to: string): () => void {
  const parts = [
    { name: slotName(from), z: 4, keyframes: fileKeyframes },
    { name: slotName(to), z: 5, keyframes: liftKeyframes },
  ].map(part => ({ ...part, before: boxOf(named(part.name)) }))
  const sheet = document.createElement('style')
  transition.ready.then(
    () => {
      const driven = parts.flatMap(({ name, z, keyframes, before }) => {
        const after = boxOf(named(name))
        return before && after ? [{ name, z, frames: keyframes(before, after) }] : []
      })
      sheet.textContent = driven.map(({ name, z }) => drivenSheet(name, z)).join('\n\n')
      document.head.appendChild(sheet)
      for (const { name, frames } of driven)
        for (const [part, keyframes] of [
          ['group', frames.group],
          ['image-pair', frames.pair],
          ['old', frames.old],
          ['new', frames.new],
        ] as const)
          document.documentElement.animate(keyframes, {
            duration: NEXT_MS,
            easing: 'linear',
            fill: 'both',
            pseudoElement: `::view-transition-${part}(${name})`,
          })
    },
    () => {},
  )
  return () => sheet.remove()
}
