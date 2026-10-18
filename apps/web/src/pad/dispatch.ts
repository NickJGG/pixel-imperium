import { unlock } from '../sound.ts'
import { type Frame, type PadButton, type PadEvent, isDirection } from './input.ts'
import { parentOf } from './route-parent.ts'
import { currentScope, focusDefault, moveFocus, openPageMenu } from './spatial.ts'

export interface PadBoard {
  readonly canvas: HTMLElement
  /** Unsolved: B and View come back to it. */
  live(): boolean
  /** Returns whether the board used the event; unused events fall through to the generic actions. */
  handle(event: PadEvent): boolean
  /** The triggers and right stick, every polled frame while it has focus; `dt` is in seconds. */
  analog?(frame: Frame, dt: number): void
}

/** What a page tells the generic actions. */
export interface PadPage {
  /** Where B goes, over `routeParent`. */
  parent?: string | undefined
  /** What View focuses, from outside the page's `[data-pad-panel]`. */
  panel?: (() => HTMLElement | null) | undefined
  /** Menu's action, instead of opening the page's `[data-pad-menu]`. */
  menu?: (() => void) | undefined
  /** Holds back A, while a solve's reveal plays. */
  hold?: boolean | undefined
  /** LB/RB's action, off a board: to the page before or after, e.g. the next province. */
  step?: ((dir: -1 | 1) => void) | undefined
}

export interface Dispatcher {
  register(board: PadBoard): () => void
  /** Registers an open `[data-pad-contain]` scope, which B closes and LB/RB step within, in place of the page. */
  contain(root: HTMLElement, close: () => void, step?: (dir: -1 | 1) => void): () => void
  /** Read at each event, so it can change between renders. */
  setPage(page: (() => PadPage) | null): void
  /** Goes to the page's parent; returns whether there was one. */
  up(): boolean
  dispatch(event: PadEvent): void
  analog(frame: Frame, dt: number): void
}

/**
 * Routes each event: wake focus, else the focused board, else the generic action. B closes the innermost
 * scope, else returns to a live board, else goes to the route parent.
 */
export function createDispatcher(navigate: (href: string) => void): Dispatcher {
  const boards = new Set<PadBoard>()
  const scopes = new Map<HTMLElement, { close: () => void; step?: ((dir: -1 | 1) => void) | undefined }>()
  let page: (() => PadPage) | null = null
  /** The button that woke focus; its repeats and release are swallowed too. */
  let waking: PadButton | null = null

  const liveBoard = () => [...boards].find(b => b.live())

  const up = () => {
    const parent = parentOf(location.pathname, page?.().parent)
    if (parent !== null) navigate(parent)
    return parent !== null
  }

  const back = () => {
    const scope = currentScope()
    if (scope) {
      const close = scopes.get(scope)?.close
      if (close) close()
      else if (scope instanceof HTMLDialogElement) scope.close()
      return
    }
    const board = liveBoard()
    if (board) return board.canvas.focus()
    up()
  }

  const step = (dir: -1 | 1) => {
    const scope = currentScope()
    if (scope) scopes.get(scope)?.step?.(dir)
    else page?.().step?.(dir)
  }

  const view = () => {
    if (document.activeElement?.closest('[data-pad-panel]')) liveBoard()?.canvas.focus()
    else page?.().panel?.()?.focus()
  }

  return {
    register(board) {
      boards.add(board)
      return () => boards.delete(board)
    },
    contain(root, close, step) {
      scopes.set(root, { close, step })
      return () => scopes.delete(root)
    },
    setPage(next) {
      page = next
    },
    up,
    dispatch(event) {
      const { kind, button } = event
      if (button === waking) {
        if (kind === 'release') waking = null
        return
      }
      if (kind === 'press') unlock()
      const active = document.activeElement
      if (kind === 'press' && (active === null || active === document.body)) {
        waking = button
        focusDefault()
        return
      }
      for (const board of boards) if (board.canvas === active && board.handle(event)) return
      if (isDirection(button)) {
        if (kind !== 'release') moveFocus(button)
        return
      }
      if (kind !== 'press') return
      const now = page?.()
      if (button === 'A') {
        if (!now?.hold && active instanceof HTMLElement) active.click()
      } else if (button === 'B') back()
      else if (button === 'View') view()
      else if (button === 'LB') step(-1)
      else if (button === 'RB') step(1)
      else if (button === 'Menu') {
        if (now?.menu) now.menu()
        else openPageMenu()
      }
    },
    analog(frame, dt) {
      for (const board of boards) if (board.canvas === document.activeElement) board.analog?.(frame, dt)
    },
  }
}
