import { type CSSProperties, useEffect, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import { KeyCap } from './album/KeyCap.tsx'
import { type Paper, paperFor } from './album/paper.ts'
import { PadGlyph } from './pad/PadGlyph.tsx'
import hud from './Hud.module.css'
import styles from './Trail.module.css'

export interface TrailStep {
  to: string
  label: string
  /** A place's paper, whose tab colors its pill. */
  paper?: Paper | undefined
  search?: Record<string, string> | undefined
}

/**
 * Names a HUD sticker, the logo or a Trail pill, so it holds still where both sides of a move have it and slaps on
 * or pops off (`Hud.module.css`) where only one does. `slot` staggers it: 0 the logo, 1 Home, 2 the parent.
 * It goes on an untilted `holder` around the sticker: a named element's own tilt moves to its group, which rotates
 * the flat snapshot as a bitmap and blurs it.
 */
export const sticker = (name: string, slot: 0 | 1 | 2): CSSProperties => ({
  viewTransitionName: name,
  viewTransitionClass: `${hud.sticker} ${hud[`slot${slot}`]}`,
})

/** A Trail pill's view-transition name, one per destination, so the same pill pairs with itself. */
export const stepName = (to: string): string =>
  `trail-${to.replace(/^\/+|\/+$/g, '').replace(/[^\w-]+/g, '-') || 'home'}`

let trail: readonly TrailStep[] = []
const listeners = new Set<() => void>()

function setTrail(next: readonly TrailStep[]): void {
  trail = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Shows `steps`, Home first and the parent last, in the HUD while the calling page is mounted. */
export function useHudTrail(steps: readonly TrailStep[]): void {
  const key = JSON.stringify(steps)
  useEffect(() => {
    setTrail(JSON.parse(key) as TrailStep[])
    return () => setTrail([])
  }, [key])
}

/**
 * The way up from a page deeper than Home's own, beside the logo: a pill per step, the parent's wearing Esc and
 * B. Only for pages that call `useHudTrail`; the logo alone takes Home's pages up.
 */
export function Trail() {
  const steps = useSyncExternalStore(subscribe, () => trail)
  if (steps.length === 0) return null
  return (
    <nav className={styles.trail} aria-label="Where you are">
      {steps.map((step, i) => (
        <span key={step.to} className={hud.holder} style={sticker(stepName(step.to), i === 0 ? 1 : 2)}>
          <Link
            to={step.to}
            {...(step.search && { search: step.search })}
            className={styles.step}
            data-variant="paper"
            data-size="compact"
            data-place={step.paper ? '' : undefined}
            style={step.paper && paperFor(step.paper)}
          >
            {step.label}
            {i === steps.length - 1 && (
              <>
                <KeyCap>Esc</KeyCap>
                <PadGlyph button="B" />
              </>
            )}
          </Link>
        </span>
      ))}
    </nav>
  )
}
