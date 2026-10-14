/**
 * The campaigns a player has started on this device: any puzzle in them solved or with progress saved. Kept per
 * account, like progress, since the Campaigns row puts them first.
 */
import { useSyncExternalStore } from 'react'
import type { Campaign } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'

const keyOf = (userId: string | null) =>
  userId === null ? 'pixel-imperium:started-campaigns' : `pixel-imperium:u:${userId}:started-campaigns`

const cache = new Map<string, ReadonlySet<string>>()
const listeners = new Set<() => void>()

function load(userId: string | null): ReadonlySet<string> {
  const key = keyOf(userId)
  let ids = cache.get(key)
  if (ids) return ids
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    ids = new Set(Array.isArray(parsed) ? parsed.filter(id => typeof id === 'string') : [])
  } catch {
    ids = new Set()
  }
  cache.set(key, ids)
  return ids
}

export const startedCampaigns = (storage: Pick<ProgressStorage, 'userId'>): ReadonlySet<string> => load(storage.userId)

export function markStarted(storage: Pick<ProgressStorage, 'userId'>, campaignId: string): void {
  const ids = load(storage.userId)
  if (ids.has(campaignId)) return
  const next = new Set([...ids, campaignId])
  cache.set(keyOf(storage.userId), next)
  try {
    localStorage.setItem(keyOf(storage.userId), JSON.stringify([...next]))
  } catch {}
  for (const listener of listeners) listener()
}

export const hasProgress = (campaign: Pick<Campaign, 'provinces'>, storage: Pick<ProgressStorage, 'loadSolved' | 'loadCells'>) =>
  campaign.provinces.some(p => p.puzzles.some(z => storage.loadSolved(z.id) !== null || storage.loadCells(z.id) !== null))

/** Records `campaign` as started if this device holds any progress in it, for saves from before the record. */
export function seedStarted(campaign: Pick<Campaign, 'id' | 'provinces'>, storage: ProgressStorage): void {
  if (!load(storage.userId).has(campaign.id) && hasProgress(campaign, storage)) markStarted(storage, campaign.id)
}

/** The started campaigns, with `also` (a signed-in profile's campaigns) counted in. */
export function useStartedCampaigns(storage: Pick<ProgressStorage, 'userId'>, also: readonly string[] = []): ReadonlySet<string> {
  const ids = useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => load(storage.userId),
  )
  return also.every(id => ids.has(id)) ? ids : new Set([...ids, ...also])
}

/** Test only: forgets what was read from `localStorage`. */
export const resetStartedCache = () => cache.clear()
