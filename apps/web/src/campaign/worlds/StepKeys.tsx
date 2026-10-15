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

/** The transitions whose spines slide or grow at the window's edges, which `StepKeys.module.css` fades the keys over. */
const LEVELS = ['to-home', 'to-province', 'into-album', 'out-of-album', 'to-board', 'from-board', 'door-board', 'door-back']

/** The keys as last laid out, and the row they stood under. */
let laidOut: { keys: readonly Key[]; row: HTMLElement | null } = { keys: [], row: null }
const planned = new WeakSet<ViewTransition>()

/**
 * Called before the keys are laid out again or leave: the first call in a transition holds the keys its old state
 * captured, and plans their part once both states are in.
 */
function notice(): void {
  const transition = document.activeViewTransition
  if (!transition || planned.has(transition)) return
  planned.add(transition)
  const before = laidOut.keys
  transition.ready.then(() => {
    const { keys, row } = laidOut
    if (transition.types.has('step')) follow(row, before, keys)
    else if (LEVELS.some(type => transition.types.has(type))) ride(before, keys)
  }, () => {})
}

/** The view-transition animations on `pseudo`. */
const on = (pseudo: string) =>
  document.getAnimations().filter(a => a.effect instanceof KeyframeEffect && a.effect.pseudoElement === pseudo) as (Animation & {
    effect: KeyframeEffect
  })[]

/**
 * A key on only one side of a step, beside an end column as it folds or opens, has no partner to glide from or to,
 * so it rides along with its column's group instead of appearing or vanishing where it rests.
 */
function follow(row: HTMLElement | null, before: readonly Key[], after: readonly Key[]): void {
  for (const dir of [-1, 1] as const) {
    const old = before.find(k => k.dir === dir)
    const now = after.find(k => k.dir === dir)
    const key = old && now ? undefined : (now ?? old)
    if (!key || !row) continue
    const effect = on(`::view-transition-group(${key.column})`)[0]?.effect
    const from = effect?.getKeyframes()[0]
    const column = [...row.children].find(c => (c as HTMLElement).style.viewTransitionName === key.column)
    if (!effect || !from?.transform || !from.width || !column) continue
    const r = column.getBoundingClientRect()
    const dx = new DOMMatrix(String(from.transform)).e + parseFloat(String(from.width)) / 2 - (r.left + r.width / 2)
    document.documentElement.animate(
      { translate: key === now ? [`${dx}px 0`, '0 0'] : ['0 0', `${-dx}px 0`] },
      // A CSS animation's timing function is its keyframes', not its effect's.
      { ...effect.getTiming(), easing: from.easing ?? 'ease', pseudoElement: `::view-transition-group(${keyName(dir)})` },
    )
  }
}

/**
 * Across a change of level, each key moves as its spine does: its spine group's translation and opacity, and its
 * spine snapshot's clip and opacity, played on the key's own snapshot. The two sides' keys share a group when both
 * have one, so the group stands still where the new key rests and the old key's snapshot is offset back to its own
 * place.
 */
function ride(before: readonly Key[], after: readonly Key[]): void {
  const slant = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slant-angle')) * Math.PI) / 180
  // A key leans back by the slant, so a move across the window is turned into the key's frame.
  const lean = (x: number, y: number) =>
    `translate(${x * Math.cos(slant) - y * Math.sin(slant)}px, ${x * Math.sin(slant) + y * Math.cos(slant)}px)`

  for (const [side, keys] of [['old', before], ['new', after]] as const) {
    for (const key of keys) {
      const image = `::view-transition-${side}(${keyName(key.dir)})`
      const own = on(image)
      if (own.length === 0) continue
      const partner = side === 'old' ? after.find(k => k.dir === key.dir) : undefined
      if (partner) on(`::view-transition-group(${keyName(key.dir)})`).forEach(a => a.cancel())
      const [dx, dy] = partner ? [key.x - partner.x, key.y - partner.y] : [0, 0]

      const group = on(`::view-transition-group(${key.column})`)[0]?.effect
      const paper = on(`::view-transition-${side}(${key.column})`)[0]?.effect
      const timing = { ...(group ?? paper ?? own[0]!.effect).getTiming(), fill: 'both' as const, pseudoElement: image }
      const spine = getComputedStyle(document.documentElement, `::view-transition-group(${key.column})`)
      const px = (length = '0') => {
        const value = length.replace(/var\((--[\w-]+)\)/, (_, name: string) => spine.getPropertyValue(name).trim())
        return (value.endsWith('%') ? (parseFloat(value) / 100) * parseFloat(spine.width) : parseFloat(value)) || 0
      }
      const moves = (group?.getKeyframes() ?? [])
        .filter(f => f.translate !== undefined || f.opacity !== undefined)
        .map(({ computedOffset, easing, translate, opacity }) => {
          const [x, y] = String(translate ?? '0').split(/\s+/)
          return { offset: computedOffset, easing, transform: lean(dx + px(x), dy + px(y)), ...(opacity !== undefined && { opacity }) }
        })
      const rest = lean(dx, dy)
      if (moves[0]?.offset !== 0) moves.unshift({ offset: 0, easing: 'linear', transform: rest })
      if (moves.at(-1)!.offset !== 1) moves.push({ offset: 1, easing: 'linear', transform: rest })

      if (group || paper) own.forEach(a => a.cancel())
      document.documentElement.animate(moves, timing)
      if (paper) document.documentElement.animate(paper.getKeyframes().map(({ computedOffset, ...f }) => f), timing)
    }
  }
}

/**
 * A key under each spine beside the open column, saying ← or → (LB or RB on a pad) steps there. Placed on the
 * stack's lean line rather than the strip's centre, in a layer of its own so the clipped spines render unchanged.
 */
export function StepKeys({ row }: { row: RefObject<HTMLDivElement | null> }) {
  const step = useSyncExternalStore(subscribe, () => stepper)
  const pad = usePadMode()
  const [keys, setKeys] = useState<readonly Key[]>([])

  useLayoutEffect(
    () => () => {
      notice()
      laidOut = { keys: [], row: null }
    },
    [],
  )

  useLayoutEffect(() => {
    const el = row.current
    if (!el || !step) {
      notice()
      laidOut = { keys: [], row: el }
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
      notice()
      laidOut = { keys: next, row: el }
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
