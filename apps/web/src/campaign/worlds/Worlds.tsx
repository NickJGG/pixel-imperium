/**
 * Worlds: provinces as full-height columns side by side, cut apart on a diagonal. Each column overlaps the one
 * before it by `--slant` and clips to the cut, so its content stays upright and in flow, padded clear of the
 * cut; only a spine's sideways name leans with it. The outer edges of the first and last columns stay straight.
 * At phone widths there's no slant: the columns stack, or with `carousel` stand side by side a screen each.
 */
import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import type { Province } from '@pixel-imperium/protocol'
import { Lock } from '../../album/Lock.tsx'
import { paperStyle } from '../../album/paper.ts'
import type { ProvinceState } from '../progress.ts'
import styles from './Worlds.module.css'

const PHONE = '(max-width: 720px)'

export function Worlds({
  children,
  className,
  carousel = false,
}: {
  children: ReactNode
  className?: string | undefined
  /** On a phone, a scroll-snapped row opening on the column marked `start`. */
  carousel?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const row = ref.current!
    const start = row.querySelector<HTMLElement>(':scope > [data-start]')
    if (!carousel || !start || !matchMedia(PHONE).matches) return
    const r = row.getBoundingClientRect()
    const s = start.getBoundingClientRect()
    row.scrollLeft += s.left - r.left - (r.width - s.width) / 2
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
  /** Where a carousel opens. */
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
export function Curtain() {
  return (
    <span className={styles.curtain} aria-hidden="true">
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
 * "Next" on the province that opens after the active one. A locked one is in fog. Links to the province's page.
 */
export function Spine({
  campaignId,
  province,
  index,
  state,
  count,
  thin = false,
  children,
  className,
}: {
  campaignId: string
  province: Province
  index: number
  state: ProvinceState
  /** E.g. "17/30", shown when the province is open. */
  count?: string | undefined
  /** Beside an opened province: a smaller name. */
  thin?: boolean
  /** Above the name, e.g. a conquered province's collage. */
  children?: ReactNode
  className?: string | undefined
}) {
  const open = state === 'active' || state === 'conquered'
  return (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId, provinceId: province.id }}
      className={[styles.world, styles.spine, className].filter(Boolean).join(' ')}
      style={paperStyle(index)}
      data-state={state}
      data-thin={thin || undefined}
      aria-label={`${province.name}, ${stateLabel[state]}`}
    >
      {children}
      <span className={styles.name}>{province.name}</span>
      {open ? (
        count && <span className={styles.count}>{count}</span>
      ) : (
        <>
          <Lock className={styles.lock} />
          {state === 'next' && <span className={styles.count}>Next</span>}
        </>
      )}
    </Link>
  )
}
