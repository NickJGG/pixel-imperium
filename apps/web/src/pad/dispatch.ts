import { unlock } from '../sound.ts'
import type { PadButton, PadEvent } from './input.ts'

export interface PadBoard {
  readonly canvas: HTMLElement
  /** Returns whether the board used the event; unused events fall through to the generic actions. */
  handle(event: PadEvent): boolean
}

export interface Dispatcher {
  register(board: PadBoard): () => void
  dispatch(event: PadEvent): void
}

/** Routes each event: wake focus, else the focused board, else the generic action. */
export function createDispatcher(): Dispatcher {
  const boards = new Set<PadBoard>()
  /** The button that woke focus; its repeats and release are swallowed too. */
  let waking: PadButton | null = null

  const wake = () => boards.values().next().value?.canvas.focus()

  return {
    register(board) {
      boards.add(board)
      return () => boards.delete(board)
    },
    dispatch(event) {
      if (event.button === waking) {
        if (event.kind === 'release') waking = null
        return
      }
      if (event.kind === 'press') unlock()
      const active = document.activeElement
      if (event.kind === 'press' && (active === null || active === document.body)) {
        waking = event.button
        wake()
        return
      }
      for (const board of boards) if (board.canvas === active && board.handle(event)) return
      if (event.kind === 'press' && event.button === 'A' && active instanceof HTMLElement) active.click()
    },
  }
}
