/**
 * Worlds: provinces as full-height columns side by side, cut apart on a diagonal. Each column overlaps the one
 * before it by `--slant` and clips to the cut, so its content stays upright and in flow, padded clear of the
 * cut; only a spine's sideways name leans with it. The outer edges of the first and last columns stay straight.
 * At phone widths there's no slant: the columns stack, or with `carousel` stand side by side a screen each.
 */
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import type { Province } from '@pixel-imperium/protocol'
import { Lock } from '../../album/Lock.tsx'
import { paperStyle } from '../../album/paper.ts'
import type { ProvinceState } from '../progress.ts'
import styles from './Worlds.module.css'

const PHONE = '(max-width: 720px)'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

const subscribePhone = (onChange: () => void) => {
  const query = matchMedia(PHONE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Whether the window is phone-width, where Worlds drop the slant. */
export const usePhone = () => useSyncExternalStore(subscribePhone, () => matchMedia(PHONE).matches)

/**
 * Whether a move between provinces morphs, the clicked column widening into the page: not under reduced motion,
 * nor on a phone, where there are no spines to widen.
 */
export const morph = () => !reducedMotion() && !matchMedia(PHONE).matches

/** Pairs a province's column across a morph, wide on one page and a spine on the other. */
export const morphName = (province: Pick<Province, 'id'>): CSSProperties => ({ viewTransitionName: `province-${province.id}` })

export function Worlds({
  children,
  className,
  carousel = false,
  onSnap,
}: {
  children: ReactNode
  className?: string | undefined
  /**
   * On a phone, a scroll-snapped row resting on the column marked `start`: it opens there, and glides there
   * whenever `start` moves to a column it isn't already resting on.
   */
  carousel?: boolean
  /** The column a carousel came to rest on after the player swiped to it, by index. */
  onSnap?: ((index: number) => void) | undefined
}) {
  const ref = useRef<HTMLDivElement>(null)
  const resting = useRef(-1)
  const onSnapRef = useRef(onSnap)
  onSnapRef.current = onSnap

  useLayoutEffect(() => {
    const row = ref.current!
    const start = row.querySelector<HTMLElement>(':scope > [data-start]')
    if (!carousel || !start || !matchMedia(PHONE).matches) return
    const index = [...row.children].indexOf(start)
    if (index === resting.current) return
    const first = resting.current === -1
    resting.current = index
    const r = row.getBoundingClientRect()
    const s = start.getBoundingClientRect()
    row.scrollTo({
      left: row.scrollLeft + s.left - r.left - (r.width - s.width) / 2,
      behavior: first || reducedMotion() ? 'instant' : 'smooth',
    })
  })

  // `scrollend` isn't everywhere yet, so a lull in scrolling counts as resting too.
  useEffect(() => {
    const row = ref.current!
    if (!carousel) return
    let lull: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      clearTimeout(lull)
      if (!matchMedia(PHONE).matches) return
      const middle = row.getBoundingClientRect().left + row.clientWidth / 2
      const columns = [...row.children]
      const distance = (el: Element) => {
        const { left, width } = el.getBoundingClientRect()
        return Math.abs(left + width / 2 - middle)
      }
      const nearest = columns.reduce((best, el) => (distance(el) < distance(best) ? el : best), columns[0]!)
      const index = columns.indexOf(nearest)
      if (index === resting.current) return
      resting.current = index
      onSnapRef.current?.(index)
    }
    const onScroll = () => {
      clearTimeout(lull)
      lull = setTimeout(settle, 150)
    }
    row.addEventListener('scroll', onScroll, { passive: true })
    row.addEventListener('scrollend', settle)
    return () => {
      clearTimeout(lull)
      row.removeEventListener('scroll', onScroll)
      row.removeEventListener('scrollend', settle)
    }
  }, [carousel])

  return (
    <div ref={ref} className={[styles.worlds, className].filter(Boolean).join(' ')} data-carousel={carousel || undefined}>
      {children}
    </div>
  )
}

/** An opened column in a province's paper, with its colour stripe across the top. */
export function World({
  index,
  fog = false,
  children,
  className,
  style,
  labelledBy,
  start = false,
}: {
  /** The province's index in its campaign, for its paper. */
  index: number
  /** Still locked: opened in the fog instead of its paper. */
  fog?: boolean
  children: ReactNode
  className?: string | undefined
  style?: CSSProperties | undefined
  labelledBy?: string | undefined
  /** Where a carousel rests. */
  start?: boolean
}) {
  return (
    <section
      className={[styles.world, className].filter(Boolean).join(' ')}
      style={{ ...paperStyle(index), ...style }}
      data-fog={fog || undefined}
      data-start={start || undefined}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  )
}

/** Fog over a `World` a Conquest just opened, falling away like a curtain. Plays once, on mount. */
export function Curtain({ late = false }: { /** Holds on until a carousel has glided over to it. */ late?: boolean }) {
  return (
    <span className={styles.curtain} data-late={late || undefined} aria-hidden="true">
      <Lock className={styles.curtainLock} />
    </span>
  )
}

const stateLabel: Record<ProvinceState, string> = {
  conquered: 'conquered',
  active: 'open',
  next: 'next, locked',
  locked: 'locked',
}

/**
 * A narrow column standing on its edge: the province's name leaning sideways, then a count, or the lock with
 * "Next" on the province that opens after the active one, and its `stamp` if it has one. A locked one is in fog.
 * Links to the province's page, morphing into it in place of this one.
 */
export function Spine({
  campaignId,
  province,
  index,
  state,
  count,
  thin = false,
  stamp,
}: {
  campaignId: string
  province: Province
  index: number
  state: ProvinceState
  /** E.g. "17/30", shown when the province is open. */
  count?: string | undefined
  /** Beside an opened province: a smaller name. */
  thin?: boolean
  /** E.g. the Conquered stamp, under the count; the spine widens to fit it. */
  stamp?: ReactNode
}) {
  const open = state === 'active' || state === 'conquered'
  return (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId, provinceId: province.id }}
      replace
      viewTransition={morph()}
      className={`${styles.world} ${styles.spine}`}
      style={{ ...paperStyle(index), ...morphName(province) }}
      data-state={state}
      data-thin={thin || undefined}
      data-stamped={stamp ? true : undefined}
      aria-label={`${province.name}, ${stateLabel[state]}`}
    >
      <span className={styles.name}>{province.name}</span>
      {open ? (
        count && <span className={styles.count}>{count}</span>
      ) : (
        <>
          <Lock className={styles.lock} />
          {state === 'next' && <span className={styles.count}>Next</span>}
        </>
      )}
      {stamp}
    </Link>
  )
}
