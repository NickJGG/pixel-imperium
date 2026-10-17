import { type CSSProperties, useEffect, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import { type Paper, paperFor } from './album/paper.ts'
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
 * Names a sticker, the crown or the Workshop's tabs, so it holds still where both sides of a move have it and slaps
 * on or pops off (`Hud.module.css`) where only one does. `slot` staggers it, 0 first.
 * It goes on an untilted `holder` around the sticker: a named element's own tilt moves to its group, which rotates
 * the flat snapshot as a bitmap and blurs it.
 */
export const sticker = (name: string, slot: 0 | 1 | 2): CSSProperties => ({
  viewTransitionName: name,
  viewTransitionClass: `${hud.sticker} ${hud[`slot${slot}`]}`,
})

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

/** Shows `steps`, Home first and the current page last, in the menu while the calling page is mounted. */
export function useHudTrail(steps: readonly TrailStep[]): void {
  const key = JSON.stringify(steps)
  useEffect(() => {
    setTrail(JSON.parse(key) as TrailStep[])
    return () => setTrail([])
  }, [key])
}

/**
 * The way up from a page deeper than Home's own, in the menu: a pill per step, the current page's last and the
 * parent's taking the focus when the menu opens. A lone step is a skeleton's fallback Home, not the current page.
 * Only for pages that call `useHudTrail`.
 */
export function Trail() {
  const steps = useSyncExternalStore(subscribe, () => trail)
  if (steps.length === 0) return null
  const current = steps.length > 1 ? steps.length - 1 : -1
  const parent = Math.max(0, steps.length - 2)
  return (
    <nav className={styles.trail} aria-label="Where you are">
      {steps.map((step, i) => (
        <Link
          key={step.to}
          to={step.to}
          {...(step.search && { search: step.search })}
          // Fuzzy matching would mark every step above this page `aria-current` too.
          activeOptions={{ exact: true }}
          className={styles.step}
          data-variant="paper"
          data-size="compact"
          data-place={step.paper ? '' : undefined}
          data-menu-focus={i === parent || undefined}
          aria-current={i === current ? 'page' : undefined}
          style={step.paper && paperFor(step.paper)}
        >
          {step.label}
        </Link>
      ))}
    </nav>
  )
}
