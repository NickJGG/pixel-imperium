import { useSyncExternalStore } from 'react'

export type MenuColumn = 'menu' | 'friends' | 'party'

/** Left to right. */
export const MENU_COLUMNS: readonly MenuColumn[] = ['menu', 'friends', 'party']

export interface MenuState {
  open: boolean
  /** The crown or party sticker that opened it, where focus goes back to; null from M. */
  opener: HTMLElement | null
  /** The column open in it: Menu from a crown or M, Party or Friends from the party sticker. */
  column: MenuColumn
}

let state: MenuState = { open: false, opener: null, column: 'menu' }
const listeners = new Set<() => void>()

function set(next: MenuState): void {
  if (next.open === state.open && next.opener === state.opener && next.column === state.column) return
  state = next
  for (const listener of listeners) listener()
}

export const getMenu = (): MenuState => state

export function subscribeMenu(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const openMenu = (opener: HTMLElement | null = null, column: MenuColumn = 'menu'): void =>
  set({ open: true, opener, column })
export const closeMenu = (): void => set({ ...state, open: false })
export const toggleMenu = (opener: HTMLElement | null = null, column: MenuColumn = 'menu'): void =>
  state.open ? closeMenu() : openMenu(opener, column)
/** Switches the open menu to `column`, folding the one that was open into its spine. */
export const setColumn = (column: MenuColumn): void => {
  if (state.open) set({ ...state, column })
}
/** The column before or after `column`, none past either end. */
export const columnBeside = (column: MenuColumn, dir: -1 | 1): MenuColumn | undefined =>
  MENU_COLUMNS[MENU_COLUMNS.indexOf(column) + dir]

let landing: { pathname: string; column: MenuColumn } | null = null

/** Opens the menu on `column` once the page at `pathname` shows, past the close every navigation brings. */
export function openMenuOn(pathname: string, column: MenuColumn): void {
  landing = { pathname, column }
}

/** The column to open on arriving at `pathname`, if a navigation asked for one; any other arrival drops the ask. */
export function takeLanding(pathname: string): MenuColumn | null {
  const column = landing?.pathname === pathname ? landing.column : null
  landing = null
  return column
}

export const useMenu = (): MenuState => useSyncExternalStore(subscribeMenu, getMenu)

let board: string | null = null
const boardListeners = new Set<() => void>()

/** Marks `puzzleId`'s board as on the page, so the menu's Next up stays away from it; returns the unmarking. */
export function showBoard(puzzleId: string): () => void {
  markBoard(puzzleId)
  return () => {
    if (board === puzzleId) markBoard(null)
  }
}

function markBoard(id: string | null): void {
  board = id
  for (const listener of boardListeners) listener()
}

export const getBoard = (): string | null => board

export const useBoard = (): string | null =>
  useSyncExternalStore(
    listener => {
      boardListeners.add(listener)
      return () => boardListeners.delete(listener)
    },
    getBoard,
  )
