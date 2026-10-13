/**
 * The transitions `transitions.ts` picks, each as one view transition the app starts the moment a navigation begins.
 * The router only wraps its final commit in a transition, so a slow load would cut to the skeleton first and morph
 * out of it after; here the transition's new state is whichever lands first, the page or its skeleton
 * (`useAnnounceSkeleton`). A page landing after its skeleton waits for the morph to end before it swaps in.
 */
import { useLayoutEffect } from 'react'
import type { AnyRouter, ParsedLocation } from '@tanstack/react-router'
import { reducedMotion } from '../../motion.ts'
import { RAIL_QUERY } from '../../play/layout.ts'
import { currentCampaign } from '../last-campaign.ts'
import { startBoardMorph, startDoor, startNextBoard } from './board-morph.ts'
import { doorOf, named, slotName } from './names.ts'
import { type Direction, boardIdOf, playIdOf, transitionFor } from './transitions.ts'
import { PHONE } from './Worlds.tsx'
import './transitions.css'
import './board-morph.css'

/** How long the old page may stand frozen before the morph plays anyway; Chrome gives up on a slow update. */
const CAP_MS = 1500

export const PENDING_MS = 300

/** A morph's skeleton shows almost at once, since the morph is already waiting on it. */
const MORPH_PENDING_MS = 100

const typed = () => CSS.supports('selector(:active-view-transition-type(a))')

interface Flight {
  transition: ViewTransition
  /** Resolves once the old page is captured and the update has begun. */
  captured: Promise<void>
  /** Ends the update: the new state is what's on the page now. */
  land: () => void
  landed: boolean
  /** Runs once the new state is on the page, before it's captured. */
  onLand?: () => void
}

let flight: Flight | null = null

const DOORS = ['door-board', 'door-back', 'grow-board', 'grow-back']

/**
 * Names a door morph's slot and board as each page stands, since only the door taken may wear the board's name, and
 * plays it; returns its cleanup.
 */
function startDoorMorph(f: Flight, door: string, from: ParsedLocation, to: ParsedLocation, clicked: EventTarget | null) {
  const back = door.endsWith('-back')
  const name = slotName(boardIdOf((back ? from : to).pathname)!)
  const worn: HTMLElement[] = []
  const wear = (el: HTMLElement | undefined) => {
    if (el) {
      el.style.viewTransitionName = name
      worn.push(el)
    }
    return el
  }
  const old = wear(back ? named(name) : doorOf(name, clicked))
  let partner: HTMLElement | undefined
  f.onLand = () => (partner = wear(back ? doorOf(name, null) : named(name)))
  const unsheet = startDoor(f.transition, name, { back, phone: door.startsWith('grow-'), from: old, to: () => partner })
  return () => {
    unsheet()
    for (const el of worn) el.style.removeProperty('view-transition-name')
  }
}

export const morphPendingMs = () => (flight ? MORPH_PENDING_MS : PENDING_MS)

/** Called by a skeleton that can stand as a morph's new state, once it's on the page. */
export function useAnnounceSkeleton(): void {
  useLayoutEffect(() => flight?.land(), [])
}

const direction = (from: ParsedLocation, to: ParsedLocation): Direction => {
  const delta = to.state.__TSR_index - from.state.__TSR_index
  return delta < 0 ? 'back' : delta === 0 ? 'replace' : 'push'
}

/** The province holding a puzzle of the campaign in memory. */
const provinceHolding = (puzzleId: string) => {
  const campaign = currentCampaign()
  const province = campaign?.provinces.find(p => p.puzzles.some(q => q.id === puzzleId))
  return campaign && province ? { campaign, province } : null
}

/** Set by the Navigation API when the browser animates the move itself, read as the router begins it. */
let uaAnimated = false

/** What was last clicked, and when: the door a navigation goes through, if it went by one. */
let click: { target: EventTarget | null; at: number } = { target: null, at: 0 }

export function installMorphNavigation(router: AnyRouter): void {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return

  if ('navigation' in window) navigation.addEventListener('navigate', e => (uaAnimated = e.hasUAVisualTransition))
  addEventListener('click', e => (click = { target: e.target, at: performance.now() }), true)

  router.subscribe('onBeforeNavigate', ({ fromLocation, toLocation }) => {
    if (fromLocation?.href === toLocation.href) return
    flight?.land()
    flight = null
    const transition =
      fromLocation &&
      transitionFor(fromLocation, toLocation, {
        reducedMotion: reducedMotion(),
        phone: matchMedia(PHONE).matches,
        rail: matchMedia(RAIL_QUERY).matches,
        direction: direction(fromLocation, toLocation),
        uaAnimated,
        typed: typed(),
        provinceOf: id => {
          const found = provinceHolding(id)
          return found && `/c/${found.campaign.id}/${found.province.id}`
        },
      })
    uaAnimated = false
    if (!transition) return
    const { types } = transition
    const back = types.includes('from-board')
    const puzzle = back || types.includes('to-board') ? playIdOf((back ? fromLocation : toLocation).pathname) : undefined
    const province = puzzle === undefined ? undefined : provinceHolding(puzzle)?.province

    let captured!: () => void
    let landed!: () => void
    const done = new Promise<void>(resolve => (landed = resolve))
    const update = () => {
      captured()
      setTimeout(f.land, CAP_MS)
      return done.then(() => f.onLand?.())
    }
    const f: Flight = {
      transition: document.startViewTransition(types.length ? { update, types } : update),
      captured: new Promise(resolve => (captured = resolve)),
      land: () => {
        f.landed = true
        landed()
      },
      landed: false,
    }
    flight = f
    const door = types.find(t => DOORS.includes(t))
    const clicked = performance.now() - click.at < 1000 ? click.target : null
    const unsheet = types.includes('next-board')
      ? startNextBoard(f.transition, playIdOf(fromLocation.pathname)!, playIdOf(toLocation.pathname)!)
      : door
        ? startDoorMorph(f, door, fromLocation, toLocation, clicked)
        : province && startBoardMorph(f.transition, province.puzzles.map(p => p.id), puzzle!, back)
    void f.transition.finished.finally(() => {
      unsheet?.()
      if (flight === f) flight = null
    })
  })

  // The router's own wrapper around its commit: inside the morph's update if the page beats its skeleton, else after
  // the morph. A second transition would cancel the morph.
  const commit = router.startViewTransition
  router.startViewTransition = async (fn: () => Promise<void>) => {
    const f = flight
    if (!f) return commit(fn)
    await f.captured
    if (f.landed) {
      await f.transition.finished.catch(() => {})
      return fn()
    }
    await fn()
    f.land()
  }
}
