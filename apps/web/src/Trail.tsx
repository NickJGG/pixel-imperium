import { useEffect, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import { KeyCap } from './album/KeyCap.tsx'
import { type PaperId, paperFor } from './album/paper.ts'
import { PadGlyph } from './pad/PadGlyph.tsx'
import styles from './Trail.module.css'

export interface TrailStep {
  to: string
  label: string
  /** A place's paper, whose tab colours its pill. */
  paper?: PaperId | undefined
}

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
        <Link
          key={step.to}
          to={step.to}
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
      ))}
    </nav>
  )
}
