import { type RefObject, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { PadGlyph } from '../../pad/PadGlyph.tsx'
import { usePadMode } from '../../pad/mode.ts'
import styles from './StepKeys.module.css'
import worlds from './Worlds.module.css'

type Dir = -1 | 1

let stepper: ((dir: Dir) => void) | null = null
const listeners = new Set<() => void>()

/** Makes `step` what the keys under the open column's neighbours do, until the returned cleanup. */
export function registerStep(step: (dir: Dir) => void): () => void {
  stepper = step
  for (const listener of listeners) listener()
  return () => {
    if (stepper !== step) return
    stepper = null
    for (const listener of listeners) listener()
  }
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

interface Key {
  dir: Dir
  name: string
  x: number
  y: number
}

const GAP = 20
const MARGIN = 8
/** A key's height, in rem, so it scales with the browser's text size. */
const KEY_REM = 1.6875

/**
 * A key under each spine beside the open column, saying ← or → (LB or RB on a pad) steps there. Placed on the
 * stack's lean line rather than the strip's centre, in a layer of its own so the clipped spines render unchanged.
 */
export function StepKeys({ row }: { row: RefObject<HTMLDivElement | null> }) {
  const step = useSyncExternalStore(subscribe, () => stepper)
  const pad = usePadMode()
  const [keys, setKeys] = useState<readonly Key[]>([])

  useLayoutEffect(() => {
    const el = row.current
    if (!el || !step) return setKeys(keys => (keys.length === 0 ? keys : []))
    const open = [...el.children].find(c => c.classList.contains(worlds.world!) && !c.classList.contains(worlds.spine!))
    const neighbours = ([-1, 1] as const).flatMap(dir => {
      const spine = dir === -1 ? open?.previousElementSibling : open?.nextElementSibling
      const stack = spine?.querySelector<HTMLElement>(`:scope > .${worlds.stack}`)
      return spine?.classList.contains(worlds.spine!) && spine.getAttribute('aria-hidden') !== 'true' && stack
        ? [{ dir, spine, stack }]
        : []
    })

    const measure = () => {
      const tan = Math.tan((parseFloat(getComputedStyle(el).getPropertyValue('--slant-angle')) * Math.PI) / 180)
      const half = (KEY_REM / 2) * parseFloat(getComputedStyle(document.documentElement).fontSize)
      const next = neighbours.map(({ dir, spine, stack }) => {
        const r = stack.getBoundingClientRect()
        const cy = r.top + r.height / 2
        const y = Math.min(r.bottom + GAP + half, innerHeight - MARGIN - half)
        return {
          dir,
          name: spine.querySelector(`.${worlds.name}`)?.textContent ?? spine.getAttribute('aria-label') ?? '',
          x: Math.round(r.left + r.width / 2 - (y - cy) * tan),
          y: Math.round(y),
        }
      })
      setKeys(keys => (JSON.stringify(keys) === JSON.stringify(next) ? keys : next))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    for (const { stack } of neighbours) observer.observe(stack)
    document.fonts.addEventListener('loadingdone', measure)
    return () => {
      observer.disconnect()
      document.fonts.removeEventListener('loadingdone', measure)
    }
  })

  if (!step) return null
  return (
    <div className={styles.stepKeys}>
      {keys.map(key => (
        <button
          key={key.dir}
          type="button"
          className={styles.key}
          style={{
            left: key.x,
            top: key.y,
            viewTransitionName: key.dir === -1 ? 'step-key-prev' : 'step-key-next',
            viewTransitionClass: styles.key,
          }}
          tabIndex={-1}
          aria-label={key.name}
          onClick={() => step(key.dir)}
        >
          <span className={styles.face}>{pad ? <PadGlyph button={key.dir === -1 ? 'LB' : 'RB'} /> : key.dir === -1 ? '←' : '→'}</span>
        </button>
      ))}
    </div>
  )
}
