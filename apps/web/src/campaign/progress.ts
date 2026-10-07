/**
 * Where a player stands in a campaign. Provinces unlock one at a time: each is conquered once
 * every puzzle in it is solved, the first unconquered one is active, the one after it is next
 * (named on the map, still locked) and the rest are locked.
 */
import type { Campaign, Province, PuzzleSummary } from '@pixel-imperium/protocol'
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

/**
 * The player's own view: every kind of solve on this device counts. Solves in the `unsolved`
 * provinces (indices) are ignored, giving the map as it stood before they were conquered.
 */
export function campaignProgress(
  campaign: Pick<Campaign, 'provinces'>,
  storage: ProgressStorage,
  unsolved: readonly number[] = [],
): CampaignProgress {
  const ignored = new Set(unsolved.flatMap(i => campaign.provinces[i]!.puzzles.map(p => p.id)))
  return provinceStates(campaign, id => !ignored.has(id) && storage.loadSolved(id) !== null, {
    unlockAll: UNLOCK_ALL,
  })
}

/**
 * The puzzle to offer after `currentId`: the next unsolved one in province order, wrapping
 * around, or the following one when everything is solved; `null` past the last solved puzzle.
 */
export function nextPuzzle<P extends { id: string }>(
  puzzles: readonly P[],
  currentId: string,
  isSolved: (puzzleId: string) => boolean,
): P | null {
  const i = puzzles.findIndex(p => p.id === currentId)
  const rest = [...puzzles.slice(i + 1), ...puzzles.slice(0, i)]
  return rest.find(p => !isSolved(p.id)) ?? puzzles[i + 1] ?? null
}

export interface ContinueAt {
  province: Province
  puzzle: PuzzleSummary
  /** 1-based slot number on the province's pages. */
  number: number
  /** Nothing solved yet anywhere in the campaign. */
  fresh: boolean
}

/** Where Continue goes: the lowest unsolved puzzle in the first active province; `null` once all is conquered. */
export function continueAt(
  campaign: Pick<Campaign, 'provinces'>,
  progress: CampaignProgress,
  isSolved: (puzzleId: string) => boolean,
): ContinueAt | null {
  const index = progress.provinces.findIndex(p => p.state === 'active')
  const province = campaign.provinces[index]
  const number = province ? province.puzzles.findIndex(p => !isSolved(p.id)) + 1 : 0
  if (!province || number === 0) return null
  const fresh = progress.provinces.every(p => p.solved === 0)
  return { province, puzzle: province.puzzles[number - 1]!, number, fresh }
}

export const isOpen = (state: ProvinceState) => state === 'active' || state === 'conquered'
