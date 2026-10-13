/**
 * Which view transition a navigation plays, if any, as a pure function of the two places and the moment's
 * conditions; `morph-nav.ts` starts whatever this names. Home ↔ an album page, a step between an album's pages or
 * Home's columns, and a step into another Year each have a morph of their own, on desktop only. Every other move
 * between two pages plays the slant wipe, on a phone too, reversed on Back and on any move to Home.
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
}

export interface Transition {
  types: string[]
}

const PROVINCE = /^\/c\/[^/]+\/[^/]+\/?$/

export const isProvincePath = (pathname: string) => PROVINCE.test(pathname)

const MONTH = /^\/daily\/\d{4}\/\d{2}\/?$/

/** A Month of Dailies' page, `/daily/<year>/<mm>`. */
export const isMonthPath = (pathname: string) => MONTH.test(pathname)

/** Pages with a board: a puzzle, a Daily and a Lesson. */
const BOARD = /^\/(?:play\/[^/]+|daily\/[^/]+\/[^/]+\/[^/]+|learn\/[^/]+\/[^/]+)\/?$/

/** Addresses that only redirect: a Campaign, an old profile spread, the old Techniques page. */
const REDIRECT = /^\/(?:c\/[^/]+|u\/[^/]+\/[^/]+\/[^/]+|learn\/techniques)\/?$/

/** A Campaign's id or a Year, the album a province or Month page belongs to. */
const albumOf = (pathname: string) => pathname.split('/')[2]!

/** A province page or a Month of Dailies' page: the two kinds of album page Home's columns open onto. */
const isAlbumPath = (pathname: string) => isProvincePath(pathname) || isMonthPath(pathname)

const isHome = (place: Place) => place.pathname === '/'

const openOf = (place: Place) => (place.search as { open?: unknown }).open

export function transitionFor(from: Place, to: Place, env: Env): Transition | null {
  if (env.reducedMotion || env.uaAnimated) return null
  const typed = (...types: string[]) => (env.typed ? { types } : null)
  // A phone's carousel has already slid to the column it steps to.
  const step = () => (env.phone ? null : { types: [] })

  // The same page with another search: Home's column steps; anything else, like Profile's `?c=`, cuts.
  if (from.pathname === to.pathname) return isHome(from) && openOf(from) !== openOf(to) ? step() : null

  const same = (test: (pathname: string) => boolean) => test(from.pathname) && test(to.pathname)
  if ((same(isProvincePath) || same(isMonthPath)) && albumOf(from.pathname) === albumOf(to.pathname)) return step()
  if (!env.phone) {
    if (isAlbumPath(from.pathname) && isHome(to)) return typed('to-home')
    if (isHome(from) && isAlbumPath(to.pathname)) return typed('to-province')
    if (same(isMonthPath))
      return typed(albumOf(from.pathname) > albumOf(to.pathname) ? 'to-year-back' : 'to-year-forward')
  }

  if (env.direction === 'replace') return null
  if ([from, to].some(({ pathname }) => BOARD.test(pathname) || REDIRECT.test(pathname))) return null
  // Every page lies over Home, so leaving Home always wipes in and returning always wipes out, whichever way history went.
  const back = isHome(to) || (!isHome(from) && env.direction === 'back')
  return back ? typed('wipe', 'back') : typed('wipe')
}
