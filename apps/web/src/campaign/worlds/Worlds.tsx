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
import { type PaperName, paperFor, paperStyle, seasonOf } from '../../album/paper.ts'
import type { HomeSearch } from '../../home/columns.ts'
import { reducedMotion } from '../../motion.ts'
import type { PadPage } from '../../pad/dispatch.ts'
import { usePadPage } from '../../pad/PadProvider.tsx'
import type { ProvinceState } from '../progress.ts'
import styles from './Worlds.module.css'

export const PHONE = '(max-width: 720px)'

const subscribePhone = (onChange: () => void) => {
  const query = matchMedia(PHONE)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Whether the window is phone-width, where Worlds drop the slant. */
export const usePhone = () => useSyncExternalStore(subscribePhone, () => matchMedia(PHONE).matches)

/** Pairs a province's column across a morph, wide on one page and a spine on the other. */
export const morphName = (province: Pick<Province, 'id'>): CSSProperties => ({ viewTransitionName: `province-${province.id}` })

/**
 * Steps to the column before or after with ←/→ and the pad's shoulders; the arrows are left alone while focus is in
 * a field or a dialog is open.
 */
export function useStep(step: (dir: -1 | 1) => void, page?: Omit<PadPage, 'step'>): void {
  usePadPage({ ...page, step })
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
  /** Its paper: a province's index in its campaign, or a Month's season. */
  index: PaperName
  /** Still locked: opened in the fog instead of its paper. */
  fog?: boolean
  children?: ReactNode
  className?: string | undefined
  style?: CSSProperties | undefined
  labelledBy?: string | undefined
  /** Where a carousel rests. */
  start?: boolean
  /** An album page's column, or the Home column that opens onto it: the two sides of the Home morph. */
  pair?: boolean
}) {
  return (
    <section
      className={[styles.world, className].filter(Boolean).join(' ')}
      style={{ ...paperFor(index), ...style, ...(pair && { viewTransitionClass: styles.pageColumn }) }}
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
export function Backdrop({ index }: { index: PaperName }) {
  return <span className={styles.backdrop} style={paperFor(index)} aria-hidden="true" />
}

let reachSheet: HTMLStyleElement | undefined

/**
 * How far each province spine in `root` stands from the window edge it grows out of in the Home morph, as `--reach`
 * on its transition group, and how far it moves to clear that edge in the board morph, as `--push`. A sheet, since a
 * transition's pseudo-elements inherit from the root, not the spine; kept in the head, since the way home plays after
 * the province page has gone.
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
          const before = centre < width / 2
          const reach = before ? -centre : width - centre
          const push = before ? -(left + w) : width - left
          return `::view-transition-group(${spine.style.viewTransitionName}) { --reach: ${reach}px; --push: ${push}px; }`
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

/**
 * A Month's spine in a Year of Dailies, built like a province's: its name, then its count pill, or in the fog for a
 * Month still to come or before the Daily began. Links to the Month's page, morphing into it like a province.
 */
export function MonthSpine({
  year,
  month,
  name,
  count,
  conquered = false,
  dim = false,
}: {
  year: number
  /** 1–12. */
  month: number
  name: string
  /** E.g. "10/31", shown unless `dim`. */
  count: string
  /** Every date solved: the pill in its colour with a check. */
  conquered?: boolean
  dim?: boolean
}) {
  const mm = String(month).padStart(2, '0')
  return (
    <Link
      to="/daily/$year/$month"
      params={{ year: String(year), month: mm }}
      replace
      className={`${styles.world} ${styles.spine} ${styles.provinceSpine}`}
      style={{ ...paperFor(seasonOf(month)), ...monthMorphName(month), viewTransitionClass: styles.provinceSpine }}
      data-state={dim ? 'locked' : 'active'}
      data-thin
      data-conquered={conquered || undefined}
      aria-label={`${name}, ${dim ? 'not open' : `${count} solved`}`}
    >
      <span className={styles.stack}>
        <span className={styles.name}>{name}</span>
        {!dim && (
          <CountPill conquered={conquered} className={styles.countPill}>
            {count}
          </CountPill>
        )}
      </span>
    </Link>
  )
}

/** Pairs a Month's column across a morph, like `morphName`. */
export const monthMorphName = (month: number): CSSProperties => ({ viewTransitionName: `month-${month}` })

/** Pairs a Learn track's column across a morph, like `morphName`. */
export const trackMorphName = (track: string): CSSProperties => ({ viewTransitionName: `track-${track}` })

/**
 * A Learn track's spine, built like a province's: its name, then its count pill. Links to the track's page, keeping
 * Learn's `back`, morphing into it like a province.
 */
export function TrackSpine({
  track,
  name,
  paper,
  done,
  total,
  back,
}: {
  track: string
  name: string
  /** As `paperStyle`'s index. */
  paper: number
  done: number
  total: number
  back: string | undefined
}) {
  const complete = done === total
  return (
    <Link
      to="/learn/$track"
      params={{ track }}
      search={back === undefined ? {} : { back }}
      replace
      className={`${styles.world} ${styles.spine} ${styles.provinceSpine}`}
      style={{ ...paperStyle(paper), ...trackMorphName(track), viewTransitionClass: styles.provinceSpine }}
      data-state="active"
      data-thin
      data-conquered={complete || undefined}
      aria-label={`${name}, ${done} of ${total} done`}
    >
      <span className={styles.stack}>
        <span className={styles.name}>{name}</span>
        <CountPill conquered={complete} className={styles.countPill}>
          {done}/{total}
        </CountPill>
      </span>
    </Link>
  )
}

/** Another Year: the one before January's, or after December's. */
interface Bookend {
  year: number
  side: 'before' | 'after'
}

const bookendProps = ({ side }: Bookend) => ({
  className: `${styles.world} ${styles.spine} ${styles.provinceSpine} ${styles.bookend}`,
  style: { viewTransitionName: `year-${side}`, viewTransitionClass: styles.provinceSpine },
  'data-thin': true,
})

const BookendFace = ({ year, side }: Bookend) => (
  <span className={styles.stack}>
    <span className={styles.name}>{year}</span>
    <span className={styles.arrow} aria-hidden="true">
      {side === 'before' ? '‹' : '›'}
    </span>
  </span>
)

/**
 * A bookend in the cover's cobalt beside January or December, linking to the other Year's nearest Month. Paired
 * across the Home morph like a Month's spine.
 */
export function YearSpine({ ref, ...bookend }: Bookend & { ref?: RefObject<HTMLAnchorElement | null> | undefined }) {
  return (
    <Link
      ref={ref}
      to="/daily/$year/$month"
      params={{ year: String(bookend.year), month: bookend.side === 'before' ? '12' : '01' }}
      replace
      {...bookendProps(bookend)}
      aria-label={`Daily ${bookend.year}`}
    >
      <BookendFace {...bookend} />
    </Link>
  )
}

/** A bookend standing in for one while its page loads. */
export function SkeletonYearSpine(bookend: Bookend) {
  return (
    <div {...bookendProps(bookend)} aria-hidden="true">
      <BookendFace {...bookend} />
    </div>
  )
}

/** A Home spine's class across the Home morph, which slides it off the side of the open column it stands on. */
const menuSpineClass = (before: boolean) => (before ? `${styles.menuSpine} ${styles.menuSpineBefore}` : styles.menuSpine)

/** A narrow column on Home standing for one of its entries, its name leaning sideways; opens that entry's column. */
export function MenuSpine({
  name,
  search,
  before,
  className,
  style,
}: {
  name: string
  search: HomeSearch
  /** Left of the open column. */
  before: boolean
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
      style={{ ...style, viewTransitionClass: menuSpineClass(before) }}
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
  before = false,
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
  /** A Home column's spine left of the open column. */
  before?: boolean
  /** Its paper, as `paperFor`'s. */
  paper: PaperName
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
        ...paperFor(paper),
        ...style,
        ...(pairs && { viewTransitionClass: pairs === 'province' ? styles.provinceSpine : menuSpineClass(before) }),
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
