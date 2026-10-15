/**
 * Worlds: provinces as full-height columns side by side, cut apart on a diagonal. Each column overlaps the one
 * before it by `--slant` and clips to the cut, so its content stays upright and in flow, padded clear of the
 * cut; only a spine's sideways name leans with it. The outer edges of the first and last columns stay straight.
 * At phone widths there's no slant: the columns stack, or with `carousel` stand side by side a screen each.
 */
import { type CSSProperties, type ReactNode, type RefObject, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import type { CampaignSummary, Province } from '@pixel-imperium/protocol'
import { CountPill } from '../../album/CountPill.tsx'
import { Lock } from '../../album/Lock.tsx'
import { NewBadge } from '../../album/NewBadge.tsx'
import { type Paper, paperFor, seasonOf } from '../../album/paper.ts'
import type { HomeSearch } from '../../home/columns.ts'
import { reducedMotion } from '../../motion.ts'
import type { PadPage } from '../../pad/dispatch.ts'
import { usePadPage } from '../../pad/PadProvider.tsx'
import type { ProvinceState } from '../progress.ts'
import { registerStep, StepKeys } from './StepKeys.tsx'
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
 * Steps to the column before or after with ←/→, the pad's shoulders, or the keys under the open column's
 * neighbours; the arrows are left alone while focus is in a field or a dialog is open.
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
    const unregister = registerStep(dir => stepRef.current(dir))
    return () => {
      removeEventListener('keydown', onKey)
      unregister()
    }
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
    <>
      <div ref={ref} className={[styles.worlds, className].filter(Boolean).join(' ')} data-carousel={carousel || undefined}>
        {children}
      </div>
      <StepKeys row={ref} />
    </>
  )
}

/**
 * A column's view-transition classes, which `column-morph.css` shapes a step by: `page` or `spine`, then the window
 * edge it stands at, if any, as `.world` sets `--column-edge`, then `more`.
 */
const columnClass = (kind: 'page' | 'spine', more?: string | false | undefined) =>
  ['column', kind, 'var(--column-edge,)', more].filter(Boolean).join(' ')

/** An opened column in a province's paper, with its color stripe across the top. */
export function World({
  paper,
  fog = false,
  children,
  className,
  style,
  labelledBy,
  start = false,
  pair = false,
}: {
  paper: Paper
  /** Still locked: opened in the fog instead of its paper. */
  fog?: boolean
  children?: ReactNode
  className?: string | undefined
  style?: CSSProperties | undefined
  labelledBy?: string | undefined
  /** Where a carousel rests. */
  start?: boolean
  /**
   * An album page's column, or the Home column that opens onto it: the two sides of the Home morph, and the column a
   * door's board morph widens into Play's paper.
   */
  pair?: boolean
}) {
  return (
    <section
      className={[styles.world, className].filter(Boolean).join(' ')}
      style={{ ...paperFor(paper), ...style, viewTransitionClass: columnClass('page', pair && styles.pageColumn) }}
      data-pair={pair || undefined}
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
export function Backdrop({ paper }: { paper: Paper }) {
  return <span className={styles.backdrop} style={paperFor(paper)} aria-hidden="true" />
}

let reachSheet: HTMLStyleElement | undefined
const reaches = new Map<string, string>()

/**
 * How far each spine in `root` stands from the window edge a province's grows out of in the Home morph, as `--reach`
 * on its transition group, and how far it moves to clear that edge in the board morphs, as `--push`; and every
 * column's paper, dots and tab, which a step lays under its snapshots (`column-morph.css`). A sheet, since a transition's pseudo-elements inherit
 * from the root, not the spine; kept in the head, and added to rather than replaced, since the way home plays after
 * the page has gone and Home has measured its own.
 */
export function useSpineReach(root: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const sheet = (reachSheet ??= document.head.appendChild(document.createElement('style')))
    const measure = () => {
      const width = document.documentElement.clientWidth
      for (const column of root.current!.querySelectorAll<HTMLElement>(`.${styles.world}`)) {
        const name = column.style.viewTransitionName
        if (!name) continue
        const paper = getComputedStyle(column)
        const tab = getComputedStyle(column, '::before').backgroundColor
        reaches.set(
          `${name} paper`,
          `::view-transition-group(${name}) { --column-paper: ${paper.backgroundColor}; --column-dots: ${paper.backgroundImage}; --column-dots-size: ${paper.backgroundSize}; --column-tab: ${tab}; }`,
        )
      }
      for (const spine of root.current!.querySelectorAll<HTMLElement>(`.${styles.spine}`)) {
        const name = spine.style.viewTransitionName
        if (!name) continue
        const { left, width: w } = spine.getBoundingClientRect()
        const centre = left + w / 2
        const before = centre < width / 2
        const reach = before ? -centre : width - centre
        const push = before ? -(left + w) : width - left
        reaches.set(name, `::view-transition-group(${name}) { --reach: ${reach}px; --push: ${push}px; }`)
      }
      sheet.textContent = [...reaches.values()].join('\n')
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
  state,
  count,
  thin = false,
  unveil,
}: {
  campaignId: string
  province: Province
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
      style={{ ...paperFor(province.paper), ...morphName(province), viewTransitionClass: columnClass('spine', styles.provinceSpine) }}
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
  /** Every date solved: the pill in its color with a check. */
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
      style={{ ...paperFor(seasonOf(month)), ...monthMorphName(month), viewTransitionClass: columnClass('spine', styles.provinceSpine) }}
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
  paper: Paper
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
      style={{ ...paperFor(paper), ...trackMorphName(track), viewTransitionClass: columnClass('spine', styles.provinceSpine) }}
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

/** Pairs a campaign's column across a morph, like `morphName`. */
export const campaignMorphName = (campaign: string): CSSProperties => ({ viewTransitionName: `campaign-${campaign}` })

/**
 * A spine's class on Campaigns: a province's across the Home morph, but sliding off the side of the open column it
 * stands on, as Home's do, into one of the campaign's provinces.
 */
const campaignSpineClass = (before: boolean) =>
  [styles.provinceSpine, styles.campaignSpine, before && styles.campaignSpineBefore].filter(Boolean).join(' ')

/**
 * A campaign's spine on Campaigns, built like a province's: its name in its paper, a New badge under it while it's Featured. Links to
 * the campaign's column, replacing the page in history, morphing into it like a province.
 */
export function CampaignSpine({
  campaign,
  before,
  featured = false,
}: {
  campaign: Pick<CampaignSummary, 'id' | 'name' | 'paper'>
  /** Left of the open column. */
  before: boolean
  featured?: boolean
}) {
  return (
    <Link
      to="/c/$campaignId"
      params={{ campaignId: campaign.id }}
      replace
      className={`${styles.world} ${styles.spine} ${styles.provinceSpine}`}
      style={{ ...paperFor(campaign.paper), ...campaignMorphName(campaign.id), viewTransitionClass: columnClass('spine', campaignSpineClass(before)) }}
      data-state="active"
      aria-label={campaign.name}
    >
      <span className={styles.stack}>
        <span className={styles.name}>{campaign.name.replace(/^The /, '')}</span>
        {featured && <NewBadge />}
      </span>
    </Link>
  )
}

/** Campaigns hidden past one edge of Campaigns' window. */
interface Stub {
  hidden: number
  side: 'before' | 'after'
  /** One of the hidden campaigns is Featured. */
  featured?: boolean | undefined
}

const stubProps = ({ side }: Stub) => ({
  className: `${styles.world} ${styles.spine} ${styles.provinceSpine} ${styles.stub}`,
  style: { viewTransitionName: `campaigns-${side}`, viewTransitionClass: columnClass('spine', campaignSpineClass(side === 'before')) },
})

const StubFace = ({ hidden, featured }: Stub) => (
  <span className={styles.stack}>
    <span className={styles.stubCount}>+{hidden}</span>
    {featured && <NewBadge />}
  </span>
)

/** The edge of Campaigns' window: a fan of fogged slivers and a "+N". Links a whole window along, to `to`. */
export function CampaignStub({ to, ...stub }: Stub & { to: string }) {
  return (
    <Link
      to="/c/$campaignId"
      params={{ campaignId: to }}
      replace
      {...stubProps(stub)}
      aria-label={`${stub.hidden} more campaign${stub.hidden === 1 ? '' : 's'} ${stub.side}`}
    >
      <StubFace {...stub} />
    </Link>
  )
}

/** A stub standing in for one while its page loads. */
export function SkeletonCampaignStub(stub: Stub) {
  return (
    <div {...stubProps(stub)} aria-hidden="true">
      <StubFace {...stub} />
    </div>
  )
}

/** Another Year: the one before January's, or after December's. */
interface Bookend {
  year: number
  side: 'before' | 'after'
}

const bookendProps = ({ side }: Bookend) => ({
  className: `${styles.world} ${styles.spine} ${styles.provinceSpine} ${styles.bookend}`,
  style: { viewTransitionName: `year-${side}`, viewTransitionClass: columnClass('spine', styles.provinceSpine) },
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
export function YearSpine(bookend: Bookend) {
  return (
    <Link
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
  featured = false,
  className,
  style,
}: {
  name: string
  search: HomeSearch
  /** Left of the open column. */
  before: boolean
  /** Home's column for a Featured campaign, which wears a New badge. */
  featured?: boolean
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
      style={{ ...style, viewTransitionClass: columnClass('spine', menuSpineClass(before)) }}
    >
      <span className={styles.stack}>
        <span className={styles.name}>{name}</span>
        {featured && <NewBadge />}
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
   * Which spine it stands in for across a morph, with that spine's morph name in `style`: a province's or a
   * campaign's, which reaches in from the window's edge, or a Home column's.
   */
  pairs?: 'province' | 'campaign' | 'menu' | undefined
  /** A Home column's or a campaign's spine left of the open column. */
  before?: boolean
  paper: Paper
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
  const album = pairs === 'province' || pairs === 'campaign'
  return (
    <div
      className={[styles.world, styles.spine, album && styles.provinceSpine, className].filter(Boolean).join(' ')}
      style={{
        ...paperFor(paper),
        ...style,
        ...(pairs && {
          viewTransitionClass: columnClass(
            'spine',
            pairs === 'campaign' ? campaignSpineClass(before) : album ? styles.provinceSpine : menuSpineClass(before),
          ),
        }),
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
