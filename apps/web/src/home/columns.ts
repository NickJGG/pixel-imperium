/** Home's columns: which the menu offers, which one is open, and the paper each wears. */
import type { Paper, PaperId, Season } from '../album/paper.ts'
import { TRACKS, nextTrack } from '../tutorial/tracks.ts'

export type Column = 'campaign' | 'featured' | 'daily' | 'learn' | 'workshop' | 'profile' | 'settings' | 'signin'

export type OpenColumn = Exclude<Column, 'campaign'>

/** `/` opens on Campaign; `?open=` names any other column. */
export interface HomeSearch {
  open?: OpenColumn
}

/** Each other column's spine name; Campaign's and Featured's are their campaigns', by `campaignSpineName`. */
export const COLUMN_NAME: Record<Exclude<Column, 'campaign' | 'featured'>, string> = {
  daily: 'Daily',
  learn: 'Learn',
  workshop: 'Workshop',
  profile: 'Profile',
  settings: 'Settings',
  signin: 'Sign in',
}

export const campaignSpineName = (campaign: { name: string }): string => campaign.name.replace(/^The /, '')

const SIGNED_IN: readonly Column[] = ['campaign', 'daily', 'learn', 'workshop', 'profile', 'settings']
const SIGNED_OUT: readonly Column[] = ['campaign', 'daily', 'learn', 'signin']

/**
 * `daily` is whether the Daily has launched; until then its column is left out. `featured` is whether there's a
 * Featured campaign for Home to show, the player not having started it; its column follows Campaign's while there is.
 */
export const columnsFor = (signedIn: boolean, daily: boolean, featured = false): readonly Column[] => {
  const columns = (signedIn ? SIGNED_IN : SIGNED_OUT).filter(c => daily || c !== 'daily')
  return featured ? ['campaign', 'featured', ...columns.slice(1)] : columns
}

const OPENABLE: readonly string[] = ['featured', 'daily', 'learn', 'workshop', 'profile', 'settings', 'signin'] satisfies OpenColumn[]

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

/** A paper, or the album's cobalt cover. */
export type ColumnPaper = Paper | 'cover'

/**
 * Each column wears where it leads: Campaign and Featured their campaigns' papers, Daily this Month's season's, Learn
 * its next Lesson's track's, Workshop its own, Profile the cobalt cover, Settings the Capital's and Sign in the Throne's. Learn takes
 * its other track's rather than match Campaign; Settings or Sign in takes the Forge's rather than match Campaign,
 * Featured or Learn.
 */
export function papers(
  campaign: Paper,
  [learn, otherLearn]: readonly [PaperId, PaperId],
  season: Season,
  featured: Paper = campaign,
): Record<Column, ColumnPaper> {
  const learnPaper = learn === campaign ? otherLearn : learn
  const taken: Paper[] = [campaign, featured, learnPaper]
  const clear = (paper: PaperId): PaperId => (taken.includes(paper) ? 'forge' : paper)
  return {
    campaign,
    featured,
    daily: season,
    learn: learnPaper,
    workshop: 'workshop',
    profile: 'cover',
    settings: clear('capital'),
    signin: clear('throne'),
  }
}
