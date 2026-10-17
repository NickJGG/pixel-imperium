/**
 * Pointer input for the whole board grid: canvas, clue panels and corner. One finger on the canvas
 * paints, one finger on a clue panel pans, two fingers pinch and pan. A second finger soon after
 * a stroke began cancels the stroke, later it keeps it; the finger left after a pinch does nothing
 * until lifted. Pressing or dragging on the minimap centres the view there. With a mouse, the wheel
 * zooms, and a middle drag or a drag with Space held pans. While the board can't zoom, only
 * painting is left, and the wheel scrolls the page. In a co-op, Alt+click Pings a cell, and so does
 * a finger held still on one, dropping the stroke it began.
 */
import { useCallback, useRef } from 'react'
import { getSettings } from '../settings.ts'
import type { BoardAssists } from './Board.tsx'
import type { PlayStore, Pos, Tool } from './store.ts'
import { type BoardView, type View, cellAt, zoomAt } from './viewport.ts'

/** A second finger this soon after a stroke began means the stroke was the start of a pinch. */
const GRACE_MS = 250
const LONG_PRESS_MS = 500

interface Point {
  x: number
  y: number
}

type Gesture =
  | { type: 'stroke'; id: number; at: number; press: { cell: Pos; timer: ReturnType<typeof setTimeout> } | null }
  | { type: 'pan'; id: number; last: Point }
  | { type: 'map'; id: number; map: Element }
  | { type: 'pinch'; ids: [number, number]; distance: number; mid: Point; view: View }
  | { type: 'tail' }

type Zone = 'canvas' | 'rows' | 'cols' | 'map'

const zoneOf = (target: EventTarget | null): Zone | null => {
  if (!(target instanceof Element)) return null
  const zone = target.closest<HTMLElement>('[data-zone]')?.dataset.zone
  if (zone === 'rows' || zone === 'cols' || zone === 'map') return zone
  return target instanceof HTMLCanvasElement ? 'canvas' : null
}

/** Returns a ref for the board grid element. */
export function useBoardGestures(store: PlayStore, view: BoardView, assists?: BoardAssists) {
  const assistsRef = useRef(assists)
  assistsRef.current = assists

  return useCallback(
    (board: HTMLElement | null) => {
      if (!board) return
      const canvas = board.querySelector<HTMLCanvasElement>(':scope > canvas')!
      const pointers = new Map<number, Point>()
      let gesture: Gesture | null = null
      let spaceHeld = false
      let over = false
      let disarmContextMenu: (() => void) | null = null

      const local = (e: { clientX: number; clientY: number }): Point => {
        const rect = canvas.getBoundingClientRect()
        return { x: e.clientX - rect.left, y: e.clientY - rect.top }
      }
      const posAt = ({ x, y }: Point): Pos => {
        const { row, col } = cellAt(view.view, x, y)
        const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max - 1)
        return { row: clamp(row, view.grid.height), col: clamp(col, view.grid.width) }
      }

      // On Windows, contextmenu fires on mouseup at whatever is under the cursor, and pointer capture
      // doesn't retarget it, so a right-drag released off the board would open the menu there.
      // The next pointerdown disarms the block in case no contextmenu arrives.
      const armContextMenuBlock = () => {
        disarmContextMenu?.()
        const block = (e: Event) => {
          e.preventDefault()
          disarm()
        }
        const disarm = () => {
          window.removeEventListener('contextmenu', block, true)
          window.removeEventListener('pointerdown', disarm, true)
          disarmContextMenu = null
        }
        window.addEventListener('contextmenu', block, true)
        window.addEventListener('pointerdown', disarm, true)
        disarmContextMenu = disarm
      }

      const startStroke = (e: PointerEvent, p: Point): Gesture | null => {
        let tool: Tool
        if (e.pointerType === 'mouse') {
          if (e.button === 0 && e.altKey && store.inCoop) {
            store.ping(posAt(p))
            return null
          } else if (e.button === 0) tool = 'fill'
          else if (e.button === 2) {
            tool = 'mark'
            armContextMenuBlock()
          } else return null
        } else {
          tool = store.getState().mode
        }
        canvas.focus({ preventScroll: true })
        store.setHover(null)
        const { lockLine } = assistsRef.current ?? getSettings()
        const lockAxis = e.pointerType === 'mouse' ? e.shiftKey || lockLine : lockLine
        const cell = posAt(p)
        store.beginStroke(cell, tool, { lockAxis })
        const stroke: Gesture = { type: 'stroke', id: e.pointerId, at: performance.now(), press: null }
        if (e.pointerType !== 'mouse' && store.inCoop) {
          const timer = setTimeout(() => {
            if (gesture !== stroke) return
            store.cancelStroke()
            store.ping(cell)
            gesture = { type: 'tail' }
          }, LONG_PRESS_MS)
          stroke.press = { cell, timer }
        }
        return stroke
      }

      const endPress = () => {
        if (gesture?.type !== 'stroke' || !gesture.press) return
        clearTimeout(gesture.press.timer)
        gesture.press = null
      }

      const centerFromMap = (map: Element, e: PointerEvent) => {
        const rect = map.getBoundingClientRect()
        const { width, height } = view.grid
        view.centerOn(((e.clientY - rect.top) / rect.height) * height, ((e.clientX - rect.left) / rect.width) * width)
      }

      const startPinch = (): Gesture => {
        const [first, second] = [...pointers]
        const [ida, a] = first!
        const [idb, b] = second!
        return {
          type: 'pinch',
          ids: [ida, idb],
          distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
          mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
          view: view.view,
        }
      }

      const onPointerDown = (e: PointerEvent) => {
        const zone = zoneOf(e.target)
        if (!zone) return
        const p = local(e)

        if (pointers.size === 0) {
          const panButton = e.pointerType === 'mouse' && (e.button === 1 || (e.button === 0 && spaceHeld))
          const primary = e.pointerType !== 'mouse' || e.button === 0
          if (view.canZoom && zone === 'map' && primary) {
            gesture = { type: 'map', id: e.pointerId, map: e.target as Element }
            centerFromMap(gesture.map, e)
          } else if (view.canZoom && (panButton || (zone !== 'canvas' && primary))) {
            gesture = { type: 'pan', id: e.pointerId, last: p }
          } else if (zone === 'canvas') {
            gesture = startStroke(e, p)
          }
          if (!gesture) return
        } else if (pointers.size === 1 && view.canZoom && e.pointerType !== 'mouse') {
          if (gesture?.type === 'stroke') {
            endPress()
            if (performance.now() - gesture.at < GRACE_MS) store.cancelStroke()
            else store.endStroke()
          }
          pointers.set(e.pointerId, p)
          gesture = startPinch()
        } else {
          return
        }
        // preventDefault suppresses the compat mouse events, which would otherwise move focus.
        e.preventDefault()
        board.setPointerCapture(e.pointerId)
        pointers.set(e.pointerId, p)
      }

      const onPointerMove = (e: PointerEvent) => {
        if (!pointers.has(e.pointerId)) {
          if (e.pointerType === 'mouse' && pointers.size === 0) {
            store.setHover(e.target === canvas ? posAt(local(e)) : null)
          }
          return
        }
        const p = local(e)
        pointers.set(e.pointerId, p)
        if (gesture?.type === 'stroke' && gesture.id === e.pointerId) {
          const cell = posAt(p)
          const { press } = gesture
          if (press && (press.cell.row !== cell.row || press.cell.col !== cell.col)) endPress()
          store.extendStroke(cell)
        } else if (gesture?.type === 'pan' && gesture.id === e.pointerId) {
          const v = view.view
          view.set({ cell: v.cell, panX: v.panX + p.x - gesture.last.x, panY: v.panY + p.y - gesture.last.y })
          gesture.last = p
        } else if (gesture?.type === 'map' && gesture.id === e.pointerId) {
          centerFromMap(gesture.map, e)
        } else if (gesture?.type === 'pinch') {
          const a = pointers.get(gesture.ids[0])!
          const b = pointers.get(gesture.ids[1])!
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
          const { view: from, distance, mid: start } = gesture
          const cell = (from.cell * Math.hypot(a.x - b.x, a.y - b.y)) / distance
          const zoomed = zoomAt(from, cell, start.x, start.y, view.fitCell, view.grid)
          view.set({ cell: zoomed.cell, panX: zoomed.panX + mid.x - start.x, panY: zoomed.panY + mid.y - start.y })
        }
      }

      const onPointerEnd = (e: PointerEvent) => {
        if (!pointers.delete(e.pointerId)) return
        if (gesture?.type === 'stroke' && gesture.id === e.pointerId) {
          endPress()
          gesture = null
          store.endStroke()
        } else if (
          (gesture?.type === 'pinch' && gesture.ids.includes(e.pointerId)) ||
          ((gesture?.type === 'pan' || gesture?.type === 'map') && gesture.id === e.pointerId)
        ) {
          gesture = pointers.size > 0 ? { type: 'tail' } : null
        }
        if (pointers.size === 0) gesture = null
      }

      const onWheel = (e: WheelEvent) => {
        if (!view.canZoom) return
        e.preventDefault()
        const { x, y } = local(e)
        const delta = e.deltaMode === WheelEvent.DOM_DELTA_LINE ? e.deltaY * 16 : e.deltaY
        view.zoomAt(view.view.cell * Math.exp(-delta * 0.0025), x, y)
      }

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code !== 'Space') return
        spaceHeld = true
        // Over the board, Space is the pan modifier, not a page scroll or a press of the focused button.
        if (over && view.canZoom) e.preventDefault()
      }
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space') spaceHeld = false
      }
      const onBlur = () => {
        spaceHeld = false
      }
      const onEnter = () => {
        over = true
      }
      const onLeave = (e: PointerEvent) => {
        over = false
        if (e.pointerType === 'mouse' && pointers.size === 0) store.setHover(null)
      }
      const onContextMenu = (e: Event) => e.preventDefault()

      const detach = view.attach(board)
      board.addEventListener('pointerdown', onPointerDown)
      board.addEventListener('pointermove', onPointerMove)
      board.addEventListener('pointerup', onPointerEnd)
      board.addEventListener('pointercancel', onPointerEnd)
      board.addEventListener('lostpointercapture', onPointerEnd)
      board.addEventListener('pointerenter', onEnter)
      board.addEventListener('pointerleave', onLeave)
      board.addEventListener('wheel', onWheel, { passive: false })
      board.addEventListener('contextmenu', onContextMenu)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('keyup', onKeyUp)
      window.addEventListener('blur', onBlur)
      return () => {
        endPress()
        detach()
        disarmContextMenu?.()
        board.removeEventListener('pointerdown', onPointerDown)
        board.removeEventListener('pointermove', onPointerMove)
        board.removeEventListener('pointerup', onPointerEnd)
        board.removeEventListener('pointercancel', onPointerEnd)
        board.removeEventListener('lostpointercapture', onPointerEnd)
        board.removeEventListener('pointerenter', onEnter)
        board.removeEventListener('pointerleave', onLeave)
        board.removeEventListener('wheel', onWheel)
        board.removeEventListener('contextmenu', onContextMenu)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('keyup', onKeyUp)
        window.removeEventListener('blur', onBlur)
      }
    },
    [store, view],
  )
}
