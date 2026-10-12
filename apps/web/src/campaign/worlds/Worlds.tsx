/**
 * Worlds: provinces as full-height columns side by side, cut apart on a diagonal. Each column overlaps the one
 * before it by `--slant` and clips to the cut, so its content stays upright and in flow, padded clear of the
 * cut; only a spine's sideways name leans with it. The outer edges of the first and last columns stay straight.
 * At phone widths there's no slant: the columns stack, or with `carousel` stand side by side a screen each.
 */
import { type CSSProperties, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import type { Province } from '@pixel-imperium/protocol'
import { CountPill } from '../../album/CountPill.tsx'
import { Lock } from '../../album/Lock.tsx'
import { paperStyle } from '../../album/paper.ts'
import type { HomeSearch } from '../../home/columns.ts'
import { usePadPage } from '../../pad/PadProvider.tsx'
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

const PROVINCE = /^\/c\/[^/]+\/[^/]+\/?$/

export const isProvincePath = (pathname: string) => PROVINCE.test(pathname)

/** Pairs a province's column across a morph, wide on one page and a spine on the other. */
export const morphName = (province: Pick<Province, 'id'>): CSSProperties => ({ viewTransitionName: `province-${province.id}` })

/**
 * Steps to the column before or after with ←/→ and the pad's shoulders; the arrows are left alone while focus is in
 * a field or a dialog is open.
 */
export function useStep(step: (dir: -1 | 1) => void): void {
  usePadPage({ step })
  const stepRef = useRef(step)
  stepRef.current = step
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable], dialog')) return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      stepRef.current(e.key === 'ArrowLeft' ? -1 : 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])
}

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
  pair = false,
}: {
  /** The province's index in its campaign, for its paper. */
  index: number
  /** Still locked: opened in the fog instead of its paper. */
  fog?: boolean
  children?: ReactNode
  className?: string | undefined
  style?: CSSProperties | undefined
  labelledBy?: string | undefined
  /** Where a carousel rests. */
  start?: boolean
  /** Home's Campaign column or a province's page, the two sides of the Home morph. */
  pair?: boolean
}) {
  return (
    <section
      className={[styles.world, className].filter(Boolean).join(' ')}
      style={{ ...paperStyle(index), ...style, ...(pair && { viewTransitionClass: styles.pageColumn }) }}
      data-fog={fog || undefined}
      data-start={start || undefined}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
  )
}

/**
 * The page column's paper, dots and stripe across the whole window, shown only during the Home morph so they
 * hold still while the spines and content move over them.
 */
export function Backdrop({ index }: { index: number }) {
  return <span className={styles.backdrop} style={paperStyle(index)} aria-hidden="true" />
}

let reachSheet: HTMLStyleElement | undefined

/**
 * How far each province spine in `root` stands from the window edge it grows out of in the Home morph, as `--reach`
 * on its transition group. A sheet, since a transition's pseudo-elements inherit from the root, not the spine; kept
 * in the head, since the way home plays after the province page has gone.
 */
export function useSpineReach(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const sheet = (reachSheet ??= document.head.appendChild(document.createElement('style')))
    const measure = () => {
      const width = document.documentElement.clientWidth
      sheet.textContent = [...root.current!.querySelectorAll<HTMLElement>(`.${styles.provinceSpine}`)]
        .map(spine => {
          const { left, width: w } = spine.getBoundingClientRect()
          const centre = left + w / 2
          const reach = centre < width / 2 ? -centre : width - centre
          return `::view-transition-group(${spine.style.viewTransitionName}) { --reach: ${reach}px; }`
        })
        .join('\n')
    }
    measure()
    addEventListener('resize', measure)
    return () => removeEventListener('resize', measure)
  })
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
 * A narrow column standing on its edge: the province's name leaning sideways, then its count pill, or the lock
 * with "Next" on the province that opens after the active one. A locked one is in fog.
 * Links to the province's page, morphing into it in place of this one.
 */
export function Spine({
  campaignId,
  province,
  index,
  state,
  count,
  thin = false,
  unveil,
}: {
  campaignId: string
  province: Province
  index: number
  state: ProvinceState
  /** E.g. "17/30", shown when the province is open. */
  count?: string | undefined
  /** Beside an opened province: a smaller name. */
  thin?: boolean
  /** Plays its conquest on the count pill. */
  unveil?: boolean | undefined
}) {
  const open = state === 'active' || state === 'conquered'
  return (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId, provinceId: province.id }}
      replace
      className={`${styles.world} ${styles.spine} ${styles.provinceSpine}`}
      style={{ ...paperStyle(index), ...morphName(province), viewTransitionClass: styles.provinceSpine }}
      data-state={state}
      data-thin={thin || undefined}
      data-conquered={state === 'conquered' || undefined}
      aria-label={`${province.name}, ${stateLabel[state]}`}
    >
      <span className={styles.stack}>
        <span className={styles.name}>{province.name}</span>
        {open ? (
          count && (
            <CountPill conquered={state === 'conquered'} unveil={unveil} className={styles.countPill}>
              {count}
            </CountPill>
          )
        ) : (
          <span className={styles.locked}>
            <Lock className={styles.lock} />
            {state === 'next' && <span className={styles.count}>Next</span>}
          </span>
        )}
      </span>
    </Link>
  )
}

/** A narrow column on Home standing for one of its entries, its name leaning sideways; opens that entry's column. */
export function MenuSpine({
  name,
  search,
  className,
  style,
}: {
  name: string
  search: HomeSearch
  className?: string | undefined
  /** Its paper and the morph name it shares with the entry's opened column. */
  style: CSSProperties
}) {
  return (
    <Link
      to="/"
      search={search}
      replace
      className={[styles.world, styles.spine, className].filter(Boolean).join(' ')}
      style={{ ...style, viewTransitionClass: styles.menuSpine }}
    >
      <span className={styles.stack}>
        <span className={styles.name}>{name}</span>
      </span>
    </Link>
  )
}

/**
 * A spine standing in for one while its page loads: the same strip, sized and clipped the same, but not a link.
 * `name` stands sideways, or a `Bar` does when the name is data.
 */
export function SkeletonSpine({
  paper,
  state,
  fog = false,
  thin = false,
  pairs,
  name,
  children,
  className,
  style,
}: {
  /**
   * Which spine it stands in for across a morph, with that spine's morph name in `style`: a province's, which
   * reaches in from the window's edge, or a Home column's.
   */
  pairs?: 'province' | 'menu' | undefined
  /** Its paper, as `paperStyle`'s index. */
  paper: number
  /** A province spine's state, for its width and fog. */
  state?: ProvinceState | undefined
  fog?: boolean
  thin?: boolean
  name: ReactNode
  /** Under the name, e.g. its count pill. */
  children?: ReactNode
  className?: string | undefined
  style?: CSSProperties | undefined
}) {
  return (
    <div
      className={[styles.world, styles.spine, pairs === 'province' && styles.provinceSpine, className].filter(Boolean).join(' ')}
      style={{
        ...paperStyle(paper),
        ...style,
        ...(pairs && { viewTransitionClass: pairs === 'province' ? styles.provinceSpine : styles.menuSpine }),
      }}
      data-state={fog ? 'locked' : state}
      data-thin={thin || undefined}
      data-conquered={state === 'conquered' || undefined}
      aria-hidden="true"
    >
      <span className={styles.stack}>
        <span className={styles.name}>{name}</span>
        {children}
      </span>
    </div>
  )
}
