/**
 * The part of `to-board` / `from-board` that hangs on which slot was clicked, over what every slot shares
 * (`board-morph.css`). The clicked slot grows into the board, or the board shrinks home into it, by a sheet written
 * for that one transition; the other slots set off in a ripple out from it, each after the ones nearer.
 * The ripple holds each slot's animations paused on their first frame until its turn: an `animation-delay` on a
 * transition's pseudo-elements leaves them out of place while they wait.
 */

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
