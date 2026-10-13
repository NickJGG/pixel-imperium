/** Home's columns: which the menu offers, which one is open, and the paper each wears. */
import type { Season } from '../album/paper.ts'
import { TRACKS, nextTrack } from '../tutorial/tracks.ts'

export type Column = 'campaign' | 'daily' | 'learn' | 'profile' | 'settings' | 'signin'

export type OpenColumn = Exclude<Column, 'campaign'>

/** `/` opens on Campaign; `?open=` names any other column. */
export interface HomeSearch {
  open?: OpenColumn
}

/** The spine names that don't come from data; Campaign's is the campaign's own. */
export const COLUMN_NAME: Record<OpenColumn, string> = {
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
export function learnPapers(done: ReadonlySet<string>): [number, number] {
  const next = nextTrack(done)
  return [next.paper, (next === TRACKS.tutorial ? TRACKS.techniques : TRACKS.tutorial).paper]
}

/** A province paper, as `paperStyle`'s index, a season's, or the album's cobalt cover. */
export type Paper = number | Season | 'cover'

const CAPITAL = 4
const THRONE = 5
const FORGE = 3

/**
 * Each column wears where it leads: Campaign the active province's paper, Daily this Month's season's, Learn its
 * next Lesson's track's, Profile the cobalt cover, Settings the Capital's and Sign in the Throne's. One that would match Campaign's takes another:
 * Learn its other track's, Settings and Sign in the Forge's.
 */
export function papers(
  active: number,
  [learn, otherLearn]: readonly [number, number],
  season: Season,
): Record<Column, Paper> {
  const campaign = active % 6
  return {
    campaign: active,
    daily: season,
    learn: learn === campaign ? otherLearn : learn,
    profile: 'cover',
    settings: campaign === CAPITAL ? FORGE : CAPITAL,
    signin: campaign === THRONE ? FORGE : THRONE,
  }
}
