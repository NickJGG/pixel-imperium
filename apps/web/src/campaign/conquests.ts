/** Which conquests the player has already watched sweep across the map, kept per player namespace. */
import type { Campaign } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'
import type { CampaignProgress } from './progress.ts'

const META = 'seen-conquests'

function loadSeen(storage: ProgressStorage): Set<string> {
  try {
    const seen: unknown = JSON.parse(storage.loadMeta(META) ?? '[]')
    return new Set(Array.isArray(seen) ? seen.filter(s => typeof s === 'string') : [])
  } catch {
    return new Set()
  }
}

const keyOf = (campaign: Campaign, index: number) => `${campaign.id}/${campaign.provinces[index]!.id}`

/** Indices of conquered provinces whose sweep hasn't played yet. */
export function unseenConquests(campaign: Campaign, progress: CampaignProgress, storage: ProgressStorage): number[] {
  const seen = loadSeen(storage)
  return progress.provinces.flatMap((p, i) => (p.state === 'conquered' && !seen.has(keyOf(campaign, i)) ? [i] : []))
}

export function markConquestsSeen(campaign: Campaign, indices: readonly number[], storage: ProgressStorage): void {
  if (indices.length === 0) return
  const seen = loadSeen(storage)
  for (const i of indices) seen.add(keyOf(campaign, i))
  storage.saveMeta(META, JSON.stringify([...seen]))
}

export const isConquestSeen = (campaign: Campaign, index: number, storage: ProgressStorage): boolean =>
  loadSeen(storage).has(keyOf(campaign, index))
