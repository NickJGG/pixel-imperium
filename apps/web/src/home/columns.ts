/** Home's columns: which the menu offers, which one is open, and the paper each wears. */
import type { PaperId, Season } from '../album/paper.ts'
import { TRACKS, nextTrack } from '../tutorial/tracks.ts'

export type Column = 'campaign' | 'daily' | 'learn' | 'profile' | 'settings' | 'signin'

export type OpenColumn = Exclude<Column, 'campaign'>

/** `/` opens on Campaign; `?open=` names any other column. */
export interface HomeSearch {
  open?: OpenColumn
}

/** Each column's spine name; Campaign's leads to Campaigns, whichever campaign it holds. */
export const COLUMN_NAME: Record<Column, string> = {
  campaign: 'Campaigns',
  daily: 'Daily',
  learn: 'Learn',
  profile: 'Profile',
  settings: 'Settings',
  signin: 'Sign in',
}

const SIGNED_IN: readonly Column[] = ['campaign', 'daily', 'learn', 'profile', 'settings']
const SIGNED_OUT: readonly Column[] = ['campaign', 'daily', 'learn', 'signin']

/** `daily` is whether the Daily has launched; until then its column is left out. */
export const columnsFor = (signedIn: boolean, daily: boolean): readonly Column[] => {
  const columns = signedIn ? SIGNED_IN : SIGNED_OUT
  return daily ? columns : columns.filter(c => c !== 'daily')
}

const OPENABLE: readonly string[] = ['daily', 'learn', 'profile', 'settings', 'signin'] satisfies OpenColumn[]

export const homeSearch = (search: Record<string, unknown>): HomeSearch =>
  typeof search.open === 'string' && OPENABLE.includes(search.open) ? { open: search.open as OpenColumn } : {}

/** The column `search` opens, or Campaign when it names one this menu doesn't have. */
export const openColumn = (columns: readonly Column[], search: HomeSearch): Column =>
  search.open !== undefined && columns.includes(search.open) ? search.open : 'campaign'

export const searchFor = (column: Column): HomeSearch => (column === 'campaign' ? {} : { open: column })

/** The neighbouring column, `undefined` past either end. */
export const stepColumn = (columns: readonly Column[], from: Column, dir: -1 | 1): Column | undefined =>
  columns[columns.indexOf(from) + dir]

/** The tracks' papers, the one Learn's next Lesson is in first; Basics again once both are finished. */
export function learnPapers(done: ReadonlySet<string>): [PaperId, PaperId] {
  const next = nextTrack(done)
  return [next.paper, (next === TRACKS.tutorial ? TRACKS.techniques : TRACKS.tutorial).paper]
}

/** A named paper, or the album's cobalt cover. */
export type Paper = PaperId | 'cover'

/**
 * Each column wears where it leads: Campaign the campaign's paper, Daily this Month's season's, Learn its next
 * Lesson's track's, Profile the cobalt cover, Settings the Capital's and Sign in the Throne's. Learn takes its other
 * track's rather than match Campaign; Settings or Sign in takes the Forge's rather than match Campaign or Learn.
 */
export function papers(
  campaign: PaperId,
  [learn, otherLearn]: readonly [PaperId, PaperId],
  season: Season,
): Record<Column, Paper> {
  const learnPaper = learn === campaign ? otherLearn : learn
  const clear = (paper: PaperId): PaperId => (paper === campaign || paper === learnPaper ? 'forge' : paper)
  return {
    campaign,
    daily: season,
    learn: learnPaper,
    profile: 'cover',
    settings: clear('capital'),
    signin: clear('throne'),
  }
}
