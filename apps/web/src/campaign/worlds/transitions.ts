/**
 * Which view transition a navigation plays, if any, as a pure function of the two places and the moment's
 * conditions; `morph-nav.ts` starts whatever this names. Home ↔ an album page or a Learn track, a step between an
 * album's pages, Learn's tracks or Home's columns, and a step into another Year each have a morph of their own, on desktop only. So does
 * a province page ↔ one of its puzzles, where Play stands its Filmstrip. Every other move between two pages plays the
 * slant wipe, on a phone too, reversed on Back and on any move to Home or from a puzzle to its page.
 */

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

/** `board` is a campaign puzzle and `page` the province page it sits on. */
const onItsPage = (board: Place, page: Place, env: Env) => {
  const id = playIdOf(board.pathname)
  return id !== undefined && env.provinceOf(id) === page.pathname.replace(/\/$/, '')
}

/** A campaign puzzle and a province page, either way round: the one kind of board move the wipe plays for now. */
const isPuzzleAndProvince = (from: Place, to: Place) =>
  (PLAY.test(from.pathname) && isProvincePath(to.pathname)) || (isProvincePath(from.pathname) && PLAY.test(to.pathname))

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
    if (env.rail && onItsPage(to, from, env)) return typed('to-board')
    if (env.rail && onItsPage(from, to, env)) return typed('from-board')
    if (isAlbumPath(from.pathname) && isHome(to)) return typed('to-home')
    if (isHome(from) && isAlbumPath(to.pathname)) return typed('to-province')
    if (same(isMonthPath))
      return typed(albumOf(from.pathname) > albumOf(to.pathname) ? 'to-year-back' : 'to-year-forward')
  }

  if (env.direction === 'replace') return null
  const board = (pathname: string) => BOARD.test(pathname) && !isPuzzleAndProvince(from, to)
  if ([from, to].some(({ pathname }) => board(pathname) || REDIRECT.test(pathname))) return null
  // Every page lies over Home, and a puzzle over its page, so going up always wipes out, whichever way history went.
  const back = isHome(to) || onItsPage(from, to, env) || (!isHome(from) && env.direction === 'back')
  return back ? typed('wipe', 'back') : typed('wipe')
}
