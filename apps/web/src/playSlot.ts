import { useSyncExternalStore } from 'react'

/** The spine's puzzle slot on /play, which PlayPage portals its title into. */
let slot: HTMLElement | null = null
const listeners = new Set<() => void>()

export function setPlaySlot(el: HTMLElement | null) {
  slot = el
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const usePlaySlot = () => useSyncExternalStore(subscribe, () => slot)
