import { type RefObject, useEffect, useRef } from 'react'
import type { BoardAssists } from '../play/Board.tsx'
import { move, startStroke } from '../play/board-actions.ts'
import type { PlayStore } from '../play/store.ts'
import type { BoardView } from '../play/viewport.ts'
import { getSettings, updateSettings } from '../settings.ts'
import { DIRECTIONS, type PadButton, isDirection } from './input.ts'
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
    canvas.addEventListener('blur', endStroke)
    const unregister = dispatcher.register({
      canvas,
      handle({ kind, button }) {
        if (store.getState().solved) return false
        const { assists, onTalkNext } = options.current
        if (kind === 'release') {
          if (button !== held) return false
          endStroke()
        } else if (isDirection(button)) {
          move(store, view, ...DIRECTIONS[button])
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
    })
    return () => {
      unregister()
      canvas.removeEventListener('blur', endStroke)
      endStroke()
    }
  }, [dispatcher, canvasRef, store, view])
}
