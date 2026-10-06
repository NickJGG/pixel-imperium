/**
 * Where a player stands in a campaign. Provinces unlock one at a time: each is conquered once
 * every puzzle in it is solved, the first unconquered one is active, the one after it is next
 * (named on the map, still locked) and the rest are locked.
 */
import type { Campaign } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'

export type ProvinceState = 'locked' | 'next' | 'active' | 'conquered'

export interface ProvinceProgress {
  state: ProvinceState
  solved: number
  total: number
}

export interface CampaignProgress {
  provinces: ProvinceProgress[]
  conquered: boolean
}

/** `unlockAll` makes every unconquered province active, for playtesting. */
export function provinceStates(
  campaign: Pick<Campaign, 'provinces'>,
  isSolved: (puzzleId: string) => boolean,
  { unlockAll = false } = {},
): CampaignProgress {
  let reached: 'active' | 'next' | null = null
  const provinces = campaign.provinces.map(({ puzzles }): ProvinceProgress => {
    const solved = puzzles.filter(p => isSolved(p.id)).length
    const total = puzzles.length
    // An empty province (a draft) is never conquered, or the whole skeleton would read as won.
    if (!reached && total > 0 && solved === total) return { state: 'conquered', solved, total }
    if (unlockAll) return { state: 'active', solved, total }
    const state: ProvinceState = reached === null ? 'active' : reached === 'active' ? 'next' : 'locked'
    reached = reached === null ? 'active' : 'next'
    return { state, solved, total }
  })
  return { provinces, conquered: provinces.every(p => p.state === 'conquered') }
}

export const UNLOCK_ALL = import.meta.env.VITE_UNLOCK_ALL === '1'

/** The player's own view: every kind of solve on this device counts. */
export const campaignProgress = (campaign: Pick<Campaign, 'provinces'>, storage: ProgressStorage) =>
  provinceStates(campaign, id => storage.loadSolved(id) !== null, { unlockAll: UNLOCK_ALL })

export const isOpen = (state: ProvinceState) => state === 'active' || state === 'conquered'
