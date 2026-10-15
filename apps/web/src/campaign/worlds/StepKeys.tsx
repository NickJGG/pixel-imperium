import { type RefObject, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
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
  /** Its spine's view-transition name. */
  column: string
  x: number
  y: number
}

const GAP = 20
const MARGIN = 8
/** A key's height, in rem, so it scales with the browser's text size. */
const KEY_REM = 1.6875

const keyName = (dir: Dir) => (dir === -1 ? 'step-key-prev' : 'step-key-next')

const followed = new WeakSet<ViewTransition>()

/**
 * A key on only one side of a step, beside an end column as it folds or opens, has no partner to glide from or to,
 * so it rides along with its column's group instead of appearing or vanishing where it rests.
 */
function follow(row: HTMLElement, before: readonly Key[], after: readonly Key[]): void {
  const transition = document.activeViewTransition
  if (!transition?.types.has('step') || followed.has(transition)) return
  const lone = ([-1, 1] as const).flatMap(dir => {
    const old = before.find(k => k.dir === dir)
    const now = after.find(k => k.dir === dir)
    return old && now ? [] : now ? [{ key: now, entering: true }] : old ? [{ key: old, entering: false }] : []
  })
  if (lone.length === 0) return
  followed.add(transition)
  transition.ready.then(() => {
    const animations = document.getAnimations()
    for (const { key, entering } of lone) {
      const effect = animations
        .map(a => a.effect)
        .find(e => e instanceof KeyframeEffect && e.pseudoElement === `::view-transition-group(${key.column})`) as KeyframeEffect | undefined
      const from = effect?.getKeyframes()[0]
      const column = [...row.children].find(c => (c as HTMLElement).style.viewTransitionName === key.column)
      if (!effect || !from?.transform || !from.width || !column) continue
      const r = column.getBoundingClientRect()
      const dx = new DOMMatrix(String(from.transform)).e + parseFloat(String(from.width)) / 2 - (r.left + r.width / 2)
      document.documentElement.animate(
        { translate: entering ? [`${dx}px 0`, '0 0'] : ['0 0', `${-dx}px 0`] },
        // A CSS animation's timing function is its keyframes', not its effect's.
        { ...effect.getTiming(), easing: from.easing ?? 'ease', pseudoElement: `::view-transition-group(${keyName(key.dir)})` },
      )
    }
  }, () => {})
}

/**
 * A key under each spine beside the open column, saying ← or → (LB or RB on a pad) steps there. Placed on the
 * stack's lean line rather than the strip's centre, in a layer of its own so the clipped spines render unchanged.
 */
export function StepKeys({ row }: { row: RefObject<HTMLDivElement | null> }) {
  const step = useSyncExternalStore(subscribe, () => stepper)
  const pad = usePadMode()
  const [keys, setKeys] = useState<readonly Key[]>([])
  const shown = useRef<readonly Key[]>([])

  useLayoutEffect(() => {
    const el = row.current
    if (!el || !step) {
      shown.current = []
      return setKeys(keys => (keys.length === 0 ? keys : []))
    }
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
          column: (spine as HTMLElement).style.viewTransitionName,
          x: Math.round(r.left + r.width / 2 - (y - cy) * tan),
          y: Math.round(y),
        }
      })
      follow(el, shown.current, next)
      shown.current = next
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
            viewTransitionName: keyName(key.dir),
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
