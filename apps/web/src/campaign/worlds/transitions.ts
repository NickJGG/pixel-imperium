/**
 * Which view transition a navigation plays, if any, as a pure function of the two places and the moment's
 * conditions; `morph-nav.ts` starts whatever this names. Home ↔ an album page or a Learn track, a step between an
 * album's pages, Learn's tracks or Home's columns, and a step into another Year each have a morph of their own, on desktop only. So does
 * a province page ↔ one of its puzzles, where Play stands its Filmstrip, and a step between two puzzles of one province
 * there. A door with no Filmstrip to fly into, Home's Next up or a Daily's slot on Home or its Month, grows its slot
 * into the board as its column widens into Play's paper; on a phone any slot opening its board just grows. Every
 * other move between two pages plays the slant wipe, on a phone too, boards and all, reversed on Back and on any move
 * to Home or from a puzzle to its page. A Lesson moves as a puzzle does, its track's page standing for a province's,
 * with Home's Learn column and the offer of a track over a puzzle for doors.
 */
import { dailyId } from '../../daily/clock.ts'

export interface Place {
  pathname: string
  search: object
}

/** A push or Forward, a Back, or a replace of the current entry. */
export type Direction = 'push' | 'back' | 'replace'

export interface Env {
  reducedMotion: boolean
  /** Phone width, where Worlds stack or carousel and there are no spines to morph. */
  phone: boolean
  /** Whether Play would stand its Filmstrip and rail beside the board. */
  rail: boolean
  /** Whether a Lesson would, which it decides by width rather than shape. */
  lessonRail: boolean
  direction: Direction
  /** The browser has already animated the move itself, as an edge-swipe Back. */
  uaAnimated: boolean
  /** Whether `:active-view-transition-type()` works, which everything typed relies on. */
  typed: boolean
  /** The province page a campaign puzzle sits on, `/c/<campaign>/<province>`, if its campaign is in memory. */
  provinceOf: (puzzleId: string) => string | null
}

export interface Transition {
  types: string[]
}

const PROVINCE = /^\/c\/[^/]+\/[^/]+\/?$/

export const isProvincePath = (pathname: string) => PROVINCE.test(pathname)

const MONTH = /^\/daily\/\d{4}\/\d{2}\/?$/

/** A Month of Dailies' page, `/daily/<year>/<mm>`. */
export const isMonthPath = (pathname: string) => MONTH.test(pathname)

const TRACK = /^\/learn\/[^/]+\/?$/

/** One of Learn's tracks, `/learn/<track>`. */
export const isTrackPath = (pathname: string) => TRACK.test(pathname)

const PLAY = /^\/play\/([^/]+)\/?$/

/** A campaign puzzle's id from its page's path. */
export const playIdOf = (pathname: string) => PLAY.exec(pathname)?.[1]

const DAY = /^\/daily\/(\d{4})\/(\d{2})\/(\d{2})\/?$/

const LESSON = /^\/learn\/([^/]+)\/([^/]+)\/?$/

/** A Lesson's track and its own id from its page's path. */
export function lessonOf(pathname: string): { track: string; lesson: string } | undefined {
  const [, track, lesson] = LESSON.exec(pathname) ?? []
  return track && lesson ? { track, lesson } : undefined
}

/** The id a Lesson's slot and board go by, as a puzzle's do: its track's and its own, since two tracks share one. */
export const lessonId = (track: string, lesson: string) => `${track}-${lesson}`

/** The puzzle a board's page plays: a campaign puzzle, a Daily or a Lesson. */
export function boardIdOf(pathname: string): string | undefined {
  const day = DAY.exec(pathname)
  if (day) return dailyId(`${day[1]}-${day[2]}-${day[3]}`)
  const lesson = lessonOf(pathname)
  return lesson ? lessonId(lesson.track, lesson.lesson) : playIdOf(pathname)
}

/** Pages with a board: a puzzle, a Daily and a Lesson. */
const BOARD = /^\/(?:play\/[^/]+|daily\/[^/]+\/[^/]+\/[^/]+|learn\/[^/]+\/[^/]+)\/?$/

/** Addresses that only redirect: a Campaign, an old profile spread, Learn without its track. */
const REDIRECT = /^\/(?:c\/[^/]+|u\/[^/]+\/[^/]+\/[^/]+|learn)\/?$/

/** A Campaign's id or a Year, the album a province or Month page belongs to. */
const albumOf = (pathname: string) => pathname.split('/')[2]!

/** A province page, a Month of Dailies' page or a Learn track: the pages Home's columns open onto. */
const isAlbumPath = (pathname: string) => isProvincePath(pathname) || isMonthPath(pathname) || isTrackPath(pathname)

const isHome = (place: Place) => place.pathname === '/'

const openOf = (place: Place) => (place.search as { open?: unknown }).open

/** `board` is a campaign puzzle and `page` the province page it sits on, or a Lesson and its track's page. */
const onItsPage = (board: Place, page: Place, env: Env) => {
  const at = page.pathname.replace(/\/$/, '')
  const lesson = lessonOf(board.pathname)
  if (lesson) return at === `/learn/${lesson.track}`
  const id = playIdOf(board.pathname)
  return id !== undefined && env.provinceOf(id) === at
}

/** Two puzzles of one province, as its Filmstrip holds them, or two Lessons of one track, as theirs does. */
const sameProvince = (from: Place, to: Place, env: Env) => {
  const [x, y] = [from, to].map(({ pathname }) => lessonOf(pathname))
  if (x || y) return x?.track === y?.track
  const [a, b] = [from, to].map(({ pathname }) => playIdOf(pathname))
  if (a === undefined || b === undefined) return false
  const province = env.provinceOf(a)
  return province !== null && province === env.provinceOf(b)
}

/**
 * `page` has a door straight into `board`: Home's Campaign, Daily or Learn column, a Month's calendar and Today, or
 * the offer of a track over a puzzle.
 */
const doorInto = (page: Place, board: Place) =>
  (isHome(page) && BOARD.test(board.pathname)) ||
  (isMonthPath(page.pathname) && DAY.test(board.pathname)) ||
  (PLAY.test(page.pathname) && LESSON.test(board.pathname))

/** A puzzle and a province page, or a Lesson and a track's page, either way round: the board moves the wipe plays. */
const isBoardAndPage = (from: Place, to: Place) => {
  const pair = (board: Place, page: Place) =>
    (PLAY.test(board.pathname) && isProvincePath(page.pathname)) ||
    (LESSON.test(board.pathname) && isTrackPath(page.pathname))
  return pair(from, to) || pair(to, from)
}

export function transitionFor(from: Place, to: Place, env: Env): Transition | null {
  if (env.reducedMotion || env.uaAnimated) return null
  const typed = (...types: string[]) => (env.typed ? { types } : null)
  // A phone's carousel has already slid to the column it steps to.
  const step = () => (env.phone ? null : { types: [] })

  // The same page with another search: Home's column steps; anything else, like Profile's `?c=`, cuts.
  if (from.pathname === to.pathname) return isHome(from) && openOf(from) !== openOf(to) ? step() : null

  const same = (test: (pathname: string) => boolean) => test(from.pathname) && test(to.pathname)
  if ((same(isProvincePath) || same(isMonthPath)) && albumOf(from.pathname) === albumOf(to.pathname)) return step()
  if (same(isTrackPath)) return step()
  if (!env.phone) {
    const rail = LESSON.test(from.pathname) || LESSON.test(to.pathname) ? env.lessonRail : env.rail
    if (rail && onItsPage(to, from, env)) return typed('to-board')
    if (rail && onItsPage(from, to, env)) return typed('from-board')
    if (rail && sameProvince(from, to, env)) return typed('next-board')
    if (isAlbumPath(from.pathname) && isHome(to)) return typed('to-home')
    if (isHome(from) && isAlbumPath(to.pathname)) return typed('to-province')
    if (same(isMonthPath))
      return typed(albumOf(from.pathname) > albumOf(to.pathname) ? 'to-year-back' : 'to-year-forward')
  }

  // Like the board morphs, into a board and out of it whichever way history went.
  const grows = (page: Place, board: Place) => doorInto(page, board) || (env.phone && onItsPage(board, page, env))
  // A door over a board already, as a track's offer over a puzzle, finds the strip and rail standing where they go.
  const over = !env.phone && BOARD.test(from.pathname) && BOARD.test(to.pathname) ? ['over-board'] : []
  if (grows(from, to)) return typed(env.phone ? 'grow-board' : 'door-board', ...over)
  if (grows(to, from)) return typed(env.phone ? 'grow-back' : 'door-back', ...over)

  if (env.direction === 'replace') return null
  const board = (pathname: string) => !env.phone && BOARD.test(pathname) && !isBoardAndPage(from, to)
  if ([from, to].some(({ pathname }) => board(pathname) || REDIRECT.test(pathname))) return null
  // Every page lies over Home, and a puzzle over its page, so going up always wipes out, whichever way history went.
  const back = isHome(to) || onItsPage(from, to, env) || (!isHome(from) && env.direction === 'back')
  return back ? typed('wipe', 'back') : typed('wipe')
}
