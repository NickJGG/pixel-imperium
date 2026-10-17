import { useSyncExternalStore } from 'react'

export interface MenuState {
  open: boolean
  /** The crown that opened it, where the panel pins its own crown and focus goes back to; null from M. */
  opener: HTMLElement | null
}

let state: MenuState = { open: false, opener: null }
const listeners = new Set<() => void>()

function set(next: MenuState): void {
  if (next.open === state.open && next.opener === state.opener) return
  state = next
  for (const listener of listeners) listener()
}

export const getMenu = (): MenuState => state

export function subscribeMenu(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const openMenu = (opener: HTMLElement | null = null): void => set({ open: true, opener })
export const closeMenu = (): void => set({ open: false, opener: state.opener })
export const toggleMenu = (opener: HTMLElement | null = null): void => (state.open ? closeMenu() : openMenu(opener))

export const useMenu = (): MenuState => useSyncExternalStore(subscribeMenu, getMenu)
