/** Home's columns: which the menu offers, which one is open, and the paper each wears. */
import { TRACKS, firstUnfinished } from '../tutorial/tracks.ts'

export type Column = 'campaign' | 'learn' | 'profile' | 'settings' | 'signin'

export type OpenColumn = Exclude<Column, 'campaign'>

/** `/` opens on Campaign; `?open=` names any other column. */
export interface HomeSearch {
  open?: OpenColumn
}

const SIGNED_IN: readonly Column[] = ['campaign', 'learn', 'profile', 'settings']
const SIGNED_OUT: readonly Column[] = ['campaign', 'learn', 'signin']

export const columnsFor = (signedIn: boolean): readonly Column[] => (signedIn ? SIGNED_IN : SIGNED_OUT)

const OPENABLE: readonly string[] = ['learn', 'profile', 'settings', 'signin'] satisfies OpenColumn[]

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
  const { tutorial, techniques } = TRACKS
  return !firstUnfinished(tutorial, done) && firstUnfinished(techniques, done)
    ? [techniques.paper, tutorial.paper]
    : [tutorial.paper, techniques.paper]
}

/** A province paper, as `paperStyle`'s index, or the album's cobalt cover. */
export type Paper = number | 'cover'

const CAPITAL = 4
const THRONE = 5
const FORGE = 3

/**
 * Each column wears where it leads: Campaign the active province's paper, Learn its next Lesson's track's, Profile
 * the cobalt cover, Settings the Capital's and Sign in the Throne's. One that would match Campaign's takes another:
 * Learn its other track's, Settings and Sign in the Forge's.
 */
export function papers(active: number, [learn, otherLearn]: readonly [number, number]): Record<Column, Paper> {
  const campaign = active % 6
  return {
    campaign: active,
    learn: learn === campaign ? otherLearn : learn,
    profile: 'cover',
    settings: campaign === CAPITAL ? FORGE : CAPITAL,
    signin: campaign === THRONE ? FORGE : THRONE,
  }
}
