/**
 * Moving focus with the d-pad: to the nearest focusable in the pressed direction, inside the innermost
 * open contain scope (a menu, confirm or dialog) if there is one.
 */
import { DIRECTIONS, type Direction } from './input.ts'

export interface Rect {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/**
 * The candidate nearest `from` in `dir`. Each is measured from `from`'s centre clamped into it, so a
 * long target beside the centre counts as straight ahead; sideways distance costs double.
 */
export function pickNext<T extends Rect>(from: Rect, dir: Direction, candidates: readonly T[]): T | null {
  const [dy, dx] = DIRECTIONS[dir]
  const fx = (from.left + from.right) / 2
  const fy = (from.top + from.bottom) / 2
  let best: T | null = null
  let bestScore = Infinity
  for (const c of candidates) {
    const tx = Math.max(c.left, Math.min(fx, c.right))
    const ty = Math.max(c.top, Math.min(fy, c.bottom))
    const main = dx ? (tx - fx) * dx : (ty - fy) * dy
    if (main <= 0) continue
    const cross = dx ? Math.abs(ty - fy) : Math.abs(tx - fx)
    const score = main + 2 * cross
    if (score < bestScore) {
      bestScore = score
      best = c
    }
  }
  return best
}

interface Container {
  contains(other: unknown): boolean
}

/** The scope nested in no other: the one holding `active`, else the last open. */
export function innermost<T extends Container>(scopes: readonly T[], active: unknown): T | null {
  const leaves = scopes.filter(s => !scopes.some(o => o !== s && s.contains(o)))
  return leaves.find(s => s.contains(active)) ?? leaves.at(-1) ?? null
}

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'

const visible = (el: Element) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'

/** The open menu, confirm or modal dialog the d-pad stays inside; `null` for the whole page. */
export function currentScope(): HTMLElement | null {
  const scopes = new Set(document.querySelectorAll<HTMLElement>('[data-pad-contain], dialog:modal'))
  return innermost([...scopes].filter(visible), document.activeElement)
}

function candidates(root: ParentNode): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    el => el.tabIndex >= 0 && !el.closest('[inert], [aria-hidden="true"]') && visible(el),
  )
}

export function moveFocus(dir: Direction): void {
  const from = document.activeElement
  if (!(from instanceof HTMLElement)) return
  const rects = candidates(currentScope() ?? document)
    .filter(el => el !== from)
    .map(el => {
      const { left, top, right, bottom } = el.getBoundingClientRect()
      return { left, top, right, bottom, el }
    })
  pickNext(from.getBoundingClientRect(), dir, rects)?.el.focus()
}

/** The scope's `[data-pad-default]`, else its first focusable, preferring `<main>` on the page. */
export function focusDefault(): void {
  const scope = currentScope()
  const root = scope ?? document
  const marked = [...root.querySelectorAll<HTMLElement>('[data-pad-default]')].find(visible)
  const main = scope ? null : document.querySelector('main')
  const target = marked ?? (main && candidates(main)[0]) ?? candidates(root)[0]
  target?.focus()
}

export const firstFocusable = (root: ParentNode): HTMLElement | null => candidates(root)[0] ?? null

/** Focuses the first focusable inside `root`, unless focus is in it already. */
export function focusInto(root: HTMLElement): void {
  if (!root.contains(document.activeElement)) firstFocusable(root)?.focus()
}

/** Clicks the visible `[data-pad-menu]` trigger, preferring the one inside `<main>`. */
export function openPageMenu(): void {
  const triggers = [...document.querySelectorAll<HTMLElement>('[data-pad-menu]')].filter(visible)
  ;(triggers.find(el => el.closest('main')) ?? triggers[0])?.click()
}
