import { type RefObject, useEffect, useRef } from 'react'
import type { BoardAssists } from '../play/Board.tsx'
import { move, startStroke } from '../play/board-actions.ts'
import type { PlayStore } from '../play/store.ts'
import { type BoardView, cellCenter, nearestVisible } from '../play/viewport.ts'
import { getSettings, updateSettings } from '../settings.ts'
import { DIRECTIONS, type PadButton, isDirection } from './input.ts'
import { PAN_DEAD, PAN_PX_PER_S, TRIGGER_DEAD, ZOOM_RATE } from './tuning.ts'
import { usePadDispatcher } from './PadProvider.tsx'

interface Options {
  store: PlayStore
  view: BoardView
  /** Fixed assists, as in Board; Y then can't toggle Straight lines. */
  assists: BoardAssists | undefined
  /** Set during a Lesson's talk beat, when A advances it instead of filling. */
  onTalkNext: (() => void) | undefined
}

/** Plays the board from a controller while its canvas has focus, until it's solved. */
export function usePadBoard(canvasRef: RefObject<HTMLCanvasElement | null>, { store, view, assists, onTalkNext }: Options) {
  const dispatcher = usePadDispatcher()
  const options = useRef({ assists, onTalkNext })
  options.current = { assists, onTalkNext }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!dispatcher || !canvas) return
    let held: PadButton | null = null
    const endStroke = () => {
      if (held === null) return
      held = null
      store.endStroke()
    }
    /** After a pan leaves the cursor off screen, moves it to the nearest whole cell in view. */
    const land = (): boolean => {
      const { cursor } = store.getState()
      const to = nearestVisible(view.view, cursor, view.fitCell, view.grid)
      if (to.row === cursor.row && to.col === cursor.col) return false
      store.moveCursor(to.row - cursor.row, to.col - cursor.col)
      return true
    }
    canvas.addEventListener('blur', endStroke)
    const unregister = dispatcher.register({
      canvas,
      live: () => !store.getState().solved,
      handle({ kind, button }) {
        if (store.getState().solved) return false
        const { assists, onTalkNext } = options.current
        if (kind === 'release') {
          if (button !== held) return false
          endStroke()
        } else if (isDirection(button)) {
          if (!land()) move(store, view, ...DIRECTIONS[button])
        } else if (button === 'A' && onTalkNext) {
          onTalkNext()
        } else if (button === 'A' || button === 'X') {
          if (held !== null || store.strokeActive) return true
          held = button
          startStroke(store, view, button === 'A' ? 'fill' : 'mark', (assists ?? getSettings()).lockLine)
        } else if (button === 'Y') {
          if (!assists) updateSettings({ lockLine: !getSettings().lockLine })
        } else if (button === 'LB') {
          store.undo()
        } else if (button === 'RB') {
          store.redo()
        } else {
          return false
        }
        return true
      },
      analog({ lt, rt, rx, ry }, dt) {
        if (!view.canZoom) return
        const past = (n: number, dead: number) => (Math.abs(n) > dead ? n : 0)
        const zoom = past(rt, TRIGGER_DEAD) - past(lt, TRIGGER_DEAD)
        if (zoom !== 0) {
          const { x, y } = cellCenter(view.view, store.getState().cursor)
          view.zoomAt(view.view.cell * Math.exp(zoom * ZOOM_RATE * dt), x, y)
        }
        const panX = past(rx, PAN_DEAD)
        const panY = past(ry, PAN_DEAD)
        if (panX !== 0 || panY !== 0) {
          const v = view.view
          view.set({ ...v, panX: v.panX - panX * PAN_PX_PER_S * dt, panY: v.panY - panY * PAN_PX_PER_S * dt })
        }
      },
    })
    return () => {
      unregister()
      canvas.removeEventListener('blur', endStroke)
      endStroke()
    }
  }, [dispatcher, canvasRef, store, view])
}
