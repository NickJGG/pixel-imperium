/**
 * Content the server reads once at startup and serves alike to every player (campaigns, puzzle clues, Years of
 * Dailies), kept for the tab's life so a navigation lands from memory instead of behind a skeleton; and the
 * signed-in player's own profile, kept until something changes it. Concurrent loads share one request, and a
 * failed one is dropped so the next load retries.
 */
import type {
  Campaign,
  CampaignSummary,
  DailyYear,
  Profile,
  PuzzleClues,
  RetiredError,
  SolveRequest,
} from '@pixel-imperium/protocol'
import { fetchCampaign, fetchCampaigns, fetchDailyYear, fetchProfile, fetchPuzzle, isRetired, submitSolve } from './api.ts'
import { earliestDay } from './daily/clock.ts'

function memo<T>(load: (key: string) => Promise<T>) {
  const entries = new Map<string, Promise<T>>()
  const get = (key: string): Promise<T> => {
    const cached = entries.get(key)
    if (cached) return cached
    const promise = load(key)
    entries.set(key, promise)
    promise.catch(() => entries.get(key) === promise && entries.delete(key))
    return promise
  }
  return Object.assign(get, { forget: (key: string) => entries.delete(key), clear: () => entries.clear() })
}

const campaignsMemo = memo(() => fetchCampaigns())
// Keyed `<id>` or `<id>?started`: a retired one's answer depends on the flag.
const campaignMemo = memo(key => fetchCampaign(...unkey(key)))
const puzzleMemo = memo(key => fetchPuzzle(...unkey(key)))
const keyOf = (id: string, started: boolean) => (started ? `${id}?started` : id)
const unkey = (key: string): [string, boolean] => [key.replace(/\?started$/, ''), key.endsWith('?started')]

const unlessRetired = <T extends object>(found: T | RetiredError | null): T | null =>
  found && !isRetired(found) ? found : null

export const campaigns = (): Promise<CampaignSummary[]> => campaignsMemo('')
export const campaign = (id: string): Promise<Campaign | null> => campaignMemo(id).then(unlessRetired)
export const puzzle = (id: string): Promise<PuzzleClues | null> => puzzleMemo(id).then(unlessRetired)

/** A campaign that may be player-made: `started` is a signed-out device's word that it has progress in it. */
export const anyCampaign = (id: string, started: boolean): Promise<Campaign | RetiredError | null> =>
  campaignMemo(keyOf(id, started))

/** A puzzle that may be player-made, `started` as for `anyCampaign`. */
export const anyPuzzle = (id: string, started: boolean): Promise<PuzzleClues | RetiredError | null> =>
  puzzleMemo(keyOf(id, started))

/** Loads a puzzle's clues ahead of opening it. */
export const prefetchPuzzle = (id: string): void => void puzzle(id).catch(() => {})

const yearMemo = memo(key => fetchDailyYear(Number(key)))
/** The UTC+14 date each Year was fetched on: a new day there can bring a new Daily. */
const yearDays = new Map<number, string>()

export function dailyYear(year: number): Promise<DailyYear | null> {
  const day = earliestDay(new Date())
  if (yearDays.get(year) !== day) {
    yearMemo.forget(String(year))
    yearDays.set(year, day)
  }
  return yearMemo(String(year))
}

const profileMemo = memo(fetchProfile)

/** The signed-in player's profile, by their `handle`. */
export const ownProfile = (handle: string): Promise<Profile | null> => profileMemo(handle)

/** Drops the own profile, for anything that changes it; the next load fetches it again. */
export const forgetOwnProfile = (): void => profileMemo.clear()

/** Submits a solve, which changes the player's profile. */
export const solve = (id: string, body: SolveRequest, signal: AbortSignal | null = null) =>
  submitSolve(id, body, signal).finally(forgetOwnProfile)

/** Drops everything, for tests. */
export function resetContent(): void {
  for (const m of [campaignsMemo, campaignMemo, puzzleMemo, yearMemo, profileMemo]) m.clear()
  yearDays.clear()
}
