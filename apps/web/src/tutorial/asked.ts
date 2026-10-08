/**
 * Whether the player has been offered the Tutorial, kept in localStorage; for an account it also syncs
 * to the server (see `account.ts`), so one answer covers every device.
 */
import { useSyncExternalStore } from 'react'
import type { ProgressStorage } from '../play/progress-storage.ts'

const KEY = 'pixel-imperium:tutorial'

function load(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

let askedAt = load()
const listeners = new Set<() => void>()

/** ISO time the Tutorial was first offered, or `null`. */
export const getAskedAt = (): string | null => askedAt

export function subscribeAsked(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Keeps the first time recorded, from this device or the server. */
export function recordAsked(at: string): void {
  if (askedAt) return
  askedAt = at
  try {
    localStorage.setItem(KEY, at)
  } catch {}
  for (const listener of listeners) listener()
}

export const markAsked = (): void => recordAsked(new Date().toISOString())

/** Never once asked, and never to a player with a solve. */
export function shouldOffer(asked: string | null, storage: ProgressStorage): boolean {
  return asked === null && !storage.puzzleIds().some(id => storage.loadSolved(id) !== null)
}

export function useShouldOffer(storage: ProgressStorage): boolean {
  return shouldOffer(useSyncExternalStore(subscribeAsked, getAskedAt), storage)
}
