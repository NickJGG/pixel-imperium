import { useSyncExternalStore } from 'react'
import { currentScope } from './spatial.ts'

/** What the controller is driving: the board, an open menu, confirm or dialog, or the rest of the page. */
export type PadOwner = 'board' | 'scope' | 'page'

function owner(): PadOwner {
  if (currentScope()) return 'scope'
  return document.activeElement?.matches('[data-pad-board]') ? 'board' : 'page'
}

function subscribe(listener: () => void): () => void {
  document.addEventListener('focusin', listener)
  document.addEventListener('focusout', listener)
  return () => {
    document.removeEventListener('focusin', listener)
    document.removeEventListener('focusout', listener)
  }
}

export function usePadOwner(): PadOwner {
  return useSyncExternalStore(subscribe, owner)
}
