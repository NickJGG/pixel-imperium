/**
 * Drag-to-reorder on the strip's chips. Past a 4px nudge a lifted copy rides the strip's column with the
 * pointer, while the chip itself stays in flow as a dashed ghost at the spot it would drop into, the others
 * sliding aside (FLIP). Releasing glides the copy into the ghost and commits the move; Escape, or releasing
 * well outside the strip, slides it home. Chips are found by `data-color` on their <li>; a chip's button is its
 * <li>'s first <button>.
 */
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { reducedMotion } from '../motion.ts'

const THRESHOLD = 4
const CANCEL_MARGIN = 60
const SLIDE_MS = 160

/** Where the dragged chip lands: past every other chip whose midpoint is at or above its centre. */
export function dropIndex(centre: number, mids: readonly number[]): number {
  let i = 0
  while (i < mids.length && mids[i]! <= centre) i++
  return i
}

export interface ChipDrag {
  color: string
  /** The colors as the strip shows them now, the dragged one at its drop spot. */
  order: string[]
  /** Where the lifted copy starts, in the strip's coordinates. */
  top: number
  left: number
  settling: boolean
}

interface Session {
  color: string
  x0: number
  y0: number
  started: boolean
  home: string[]
  order: string[]
  /** Pointer to the chip's top edge, so the copy rides where it was grabbed. */
  grabTop: number
  height: number
}

export function useChipDrag(
  colors: readonly string[],
  stripRef: RefObject<HTMLElement | null>,
  listRef: RefObject<HTMLOListElement | null>,
  onMove: (from: number, to: number) => void,
) {
  const [drag, setDrag] = useState<ChipDrag | null>(null)
  const floaterRef = useRef<HTMLDivElement>(null)
  const session = useRef<Session | null>(null)
  const dragged = useRef(false)
  const before = useRef<Map<string, number> | null>(null)
  const props = useRef({ colors, onMove })
  props.current = { colors, onMove }

  const chips = () => [...listRef.current!.querySelectorAll<HTMLLIElement>(':scope > li[data-color]')]
  const buttonOf = (li: HTMLLIElement) => li.querySelector('button')!
  const find = (color: string) => chips().find(li => li.dataset.color === color)!

  /**
   * A chip's button in the list's coordinates, ignoring any slide in progress. Measured off its <li>, since
   * the slide's transform on the <li> makes Firefox measure the button's offsetTop from the <li> instead.
   */
  const chipAt = (li: HTMLLIElement) => {
    const box = li.getBoundingClientRect()
    const button = buttonOf(li).getBoundingClientRect()
    return { top: li.offsetTop + button.top - box.top, left: li.offsetLeft + button.left - box.left, height: button.height }
  }

  /** The chip's button, in the strip's coordinates, ignoring any slide in progress. */
  const restingBox = (color: string) => {
    const list = listRef.current!
    const chip = chipAt(find(color))
    const listBox = list.getBoundingClientRect()
    const strip = stripRef.current!.getBoundingClientRect()
    return {
      top: listBox.top - strip.top + chip.top - list.scrollTop,
      left: listBox.left - strip.left + chip.left - list.scrollLeft,
    }
  }

  const reorder = (s: Session, order: string[]) => {
    if (order.every((c, i) => c === s.order[i])) return
    s.order = order
    before.current = new Map(chips().map(li => [li.dataset.color!, li.offsetTop]))
    setDrag(d => d && { ...d, order })
  }

  useLayoutEffect(() => {
    const was = before.current
    before.current = null
    if (!was || reducedMotion()) return
    for (const li of chips()) {
      const dy = (was.get(li.dataset.color!) ?? li.offsetTop) - li.offsetTop
      if (!dy) continue
      li.style.transition = 'none'
      li.style.transform = `translateY(${dy}px)`
      requestAnimationFrame(() => {
        li.style.transition = `transform ${SLIDE_MS}ms ease`
        li.style.transform = ''
      })
    }
  })

  useLayoutEffect(() => {
    const floater = floaterRef.current
    if (!drag?.settling || !floater) return
    const { top, left } = restingBox(drag.color)
    floater.style.transition = `top ${SLIDE_MS}ms cubic-bezier(.2,.9,.3,1.2), left ${SLIDE_MS}ms ease, transform ${SLIDE_MS}ms ease`
    floater.style.top = `${top}px`
    floater.style.left = `${left}px`
    floater.style.transform = 'none'
    const timer = setTimeout(() => setDrag(null), SLIDE_MS + 10)
    return () => clearTimeout(timer)
  }, [drag?.settling])

  const start = (e: PointerEvent, s: Session) => {
    const button = buttonOf(find(s.color)).getBoundingClientRect()
    s.started = true
    s.grabTop = e.clientY - button.top
    s.height = button.height
    dragged.current = true
    setDrag({ color: s.color, order: s.order, ...restingBox(s.color), settling: false })
  }

  const ride = (e: PointerEvent, s: Session) => {
    const strip = stripRef.current!.getBoundingClientRect()
    if (floaterRef.current) floaterRef.current.style.top = `${e.clientY - strip.top - s.grabTop}px`
    const list = listRef.current!
    const centre = e.clientY - s.grabTop + s.height / 2 - list.getBoundingClientRect().top + list.scrollTop
    const others = chips().filter(li => li.dataset.color !== s.color)
    const mids = others.map(li => {
      const chip = chipAt(li)
      return chip.top + chip.height / 2
    })
    const at = dropIndex(centre, mids)
    const order = others.map(li => li.dataset.color!)
    order.splice(at, 0, s.color)
    reorder(s, order)
  }

  const finish = (cancel: boolean) => {
    const s = session.current
    session.current = null
    removeListeners.current()
    if (!s?.started) return
    setTimeout(() => (dragged.current = false))
    if (cancel) reorder(s, s.home)
    else {
      const from = props.current.colors.indexOf(s.color)
      const to = s.order.indexOf(s.color)
      if (from !== to) props.current.onMove(from, to)
    }
    if (reducedMotion()) setDrag(null)
    else setDrag(d => d && { ...d, order: cancel ? s.home : s.order, settling: true })
  }

  const removeListeners = useRef(() => {})
  useEffect(() => () => removeListeners.current(), [])

  const onPointerDown = (e: ReactPointerEvent, color: string) => {
    dragged.current = false
    if (e.button !== 0 || session.current || drag) return
    const s: Session = {
      color,
      x0: e.clientX,
      y0: e.clientY,
      started: false,
      home: [...props.current.colors],
      order: [...props.current.colors],
      grabTop: 0,
      height: 0,
    }
    session.current = s
    const move = (ev: PointerEvent) => {
      if (!s.started) {
        if (Math.hypot(ev.clientX - s.x0, ev.clientY - s.y0) < THRESHOLD) return
        start(ev, s)
      }
      ride(ev, s)
    }
    const up = (ev: PointerEvent) => {
      const r = stripRef.current!.getBoundingClientRect()
      const away =
        ev.clientX < r.left - CANCEL_MARGIN ||
        ev.clientX > r.right + CANCEL_MARGIN ||
        ev.clientY < r.top - CANCEL_MARGIN ||
        ev.clientY > r.bottom + CANCEL_MARGIN
      finish(away)
    }
    const cancel = () => finish(true)
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !s.started) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      finish(true)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('keydown', key, true)
    removeListeners.current = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('keydown', key, true)
    }
  }

  /** True once for the click that ends a drag, which shouldn't count as a click on the chip. */
  const consumeDrag = () => {
    const was = dragged.current
    dragged.current = false
    return was
  }

  return { drag, order: drag?.order ?? colors, floaterRef, onPointerDown, consumeDrag }
}
