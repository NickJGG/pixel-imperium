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
import { type Direction, transitionFor } from './transitions.ts'
import { PHONE } from './Worlds.tsx'
import './transitions.css'

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
}

let flight: Flight | null = null

export const morphPendingMs = () => (flight ? MORPH_PENDING_MS : PENDING_MS)

/** Called by a skeleton that can stand as a morph's new state, once it's on the page. */
export function useAnnounceSkeleton(): void {
  useLayoutEffect(() => flight?.land(), [])
}

const direction = (from: ParsedLocation, to: ParsedLocation): Direction => {
  const delta = to.state.__TSR_index - from.state.__TSR_index
  return delta < 0 ? 'back' : delta === 0 ? 'replace' : 'push'
}

/** Set by the Navigation API when the browser animates the move itself, read as the router begins it. */
let uaAnimated = false

export function installMorphNavigation(router: AnyRouter): void {
  if (typeof document === 'undefined' || typeof document.startViewTransition !== 'function') return

  if ('navigation' in window) navigation.addEventListener('navigate', e => (uaAnimated = e.hasUAVisualTransition))

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
      })
    uaAnimated = false
    if (!transition) return
    const { types } = transition

    let captured!: () => void
    let landed!: () => void
    const done = new Promise<void>(resolve => (landed = resolve))
    const update = () => {
      captured()
      setTimeout(f.land, CAP_MS)
      return done
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
    void f.transition.finished.finally(() => {
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
