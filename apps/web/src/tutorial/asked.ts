/**
 * Whether the player has been offered each track, kept in localStorage; for an account it also syncs
 * to the server (see `account.ts`), so one answer covers every device.
 */
import { useSyncExternalStore } from 'react'
import type { Province } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { TRACKS, type Track, startedTrack } from './tracks.ts'

export type Offer = Track['id']

export interface Asked {
  /** ISO time the offer was first made, or `null`. */
  get: () => string | null
  subscribe: (listener: () => void) => () => void
  /** Keeps the first time recorded, from this device or the server. */
  record: (at: string) => void
  mark: () => void
}

function createAsked(key: string): Asked {
  let askedAt: string | null
  try {
    askedAt = localStorage.getItem(key)
  } catch {
    askedAt = null
  }
  const listeners = new Set<() => void>()
  const record = (at: string) => {
    if (askedAt) return
    askedAt = at
    try {
      localStorage.setItem(key, at)
    } catch {}
    for (const listener of listeners) listener()
  }
  return {
    get: () => askedAt,
    subscribe: listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    record,
    mark: () => record(new Date().toISOString()),
  }
}

const STORES: Record<Offer, Asked> = {
  tutorial: createAsked('pixel-imperium:tutorial'),
  techniques: createAsked('pixel-imperium:techniques-asked'),
}

export const asked = (offer: Offer): Asked => STORES[offer]

const useAskedAt = (offer: Offer) => useSyncExternalStore(STORES[offer].subscribe, STORES[offer].get)

/** Never once asked, and never to a player with a solve. */
export function shouldOffer(askedAt: string | null, storage: ProgressStorage): boolean {
  return askedAt === null && !storage.puzzleIds().some(id => storage.loadSolved(id) !== null)
}

export const useShouldOffer = (storage: ProgressStorage): boolean => shouldOffer(useAskedAt('tutorial'), storage)

/** In the province flagged for them, never once asked, and none of them done yet. */
export function shouldOfferTechniques(askedAt: string | null, province: Province, done: ReadonlySet<string>): boolean {
  return askedAt === null && province.techniques === true && !startedTrack(TRACKS.techniques, done)
}

export const useShouldOfferTechniques = (province: Province, done: ReadonlySet<string>): boolean =>
  shouldOfferTechniques(useAskedAt('techniques'), province, done)
