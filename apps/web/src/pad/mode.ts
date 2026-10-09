/**
 * Pad mode: on from controller input, off from a pointer press or a key. Shown as `data-pad` on <html>,
 * which turns on the focus ring for every focused element. Not persisted.
 */
import { useSyncExternalStore } from 'react'

let padMode = false
const listeners = new Set<() => void>()

export const getPadMode = (): boolean => padMode

export function setPadMode(on: boolean): void {
  if (on === padMode) return
  padMode = on
  if (on) document.documentElement.dataset.pad = ''
  else delete document.documentElement.dataset.pad
  for (const listener of listeners) listener()
}

export function subscribePadMode(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePadMode(): boolean {
  return useSyncExternalStore(subscribePadMode, getPadMode)
}

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta'])

addEventListener('pointerdown', () => setPadMode(false), true)
addEventListener(
  'keydown',
  e => {
    if (!MODIFIERS.has(e.key)) setPadMode(false)
  },
  true,
)
