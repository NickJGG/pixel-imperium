/**
 * Drag a puzzle's slot in the builder: past a 4px nudge a copy rides with the pointer while the slot stays put as a
 * ghost; over another slot it marks the side it would drop on, over a province's spine it marks the spine. Releasing
 * moves it there; Escape, or releasing anywhere else, leaves it be. Slots are `[data-slot]` <li>s numbered by index,
 * spines `[data-drop-province]`, 1-based.
 */
import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from 'react'

const THRESHOLD = 4

/** Where a drop lands: before slot `i` of this province (counted once the dragged one has left), or on province `k`. */
export type Drop = { i: number } | { k: number }

export interface SlotDrag {
  from: number
  x: number
  y: number
  drop: Drop | null
  /** The slot or spine it's over, and the side of a slot. */
  over: { slot: number; side: 'before' | 'after' } | { province: number } | null
}

/** The drop at a point, for a slot dragged `from` in province `k`. */
function dropAt(x: number, y: number, from: number, k: number): Pick<SlotDrag, 'drop' | 'over'> {
  const el = document.elementFromPoint(x, y)
  const spine = el?.closest<HTMLElement>('[data-drop-province]')
  if (spine) {
    const to = Number(spine.dataset.dropProvince) - 1
    return to === k ? { drop: null, over: null } : { drop: { k: to }, over: { province: to } }
  }
  const slot = el?.closest<HTMLElement>('[data-slot]')
  if (!slot) return { drop: null, over: null }
  const at = Number(slot.dataset.slot)
  const box = slot.getBoundingClientRect()
  const side = x < box.left + box.width / 2 ? 'before' : 'after'
  const index = side === 'before' ? at : at + 1
  const i = index > from ? index - 1 : index
  return { drop: i === from ? null : { i }, over: at === from ? null : { slot: at, side } }
}

export function useSlotDrag(k: number, onDrop: (from: number, drop: Drop) => void) {
  const [drag, setDrag] = useState<SlotDrag | null>(null)
  const dragged = useRef(false)
  const props = useRef({ k, onDrop })
  props.current = { k, onDrop }
  const removeListeners = useRef(() => {})
  useEffect(() => () => removeListeners.current(), [])

  const onPointerDown = (e: ReactPointerEvent, from: number) => {
    dragged.current = false
    if (e.button !== 0 || e.pointerType === 'touch') return
    const x0 = e.clientX
    const y0 = e.clientY
    let started = false
    let last: SlotDrag | null = null
    const end = (commit: boolean) => {
      removeListeners.current()
      removeListeners.current = () => {}
      if (!started) return
      setTimeout(() => (dragged.current = false))
      setDrag(null)
      if (commit && last?.drop) props.current.onDrop(from, last.drop)
    }
    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < THRESHOLD) return
        started = true
        dragged.current = true
      }
      last = { from, x: ev.clientX, y: ev.clientY, ...dropAt(ev.clientX, ev.clientY, from, props.current.k) }
      setDrag(last)
    }
    const up = () => end(true)
    const cancel = () => end(false)
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !started) return
      ev.preventDefault()
      ev.stopImmediatePropagation()
      end(false)
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

  /** True once for the click that ends a drag, which shouldn't open the puzzle. */
  const consumeDrag = () => {
    const was = dragged.current
    dragged.current = false
    return was
  }

  return { drag, onPointerDown, consumeDrag }
}
