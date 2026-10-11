/**
 * Worlds: provinces as full-height columns side by side, cut apart on a diagonal. Each column overlaps the one
 * before it by `--slant` and clips to the cut, so its content stays upright and in flow, padded clear of the
 * cut; only a spine's sideways name leans with it. The outer edges of the first and last columns stay straight.
 * At phone widths there's no slant: the columns stack.
 */
import type { CSSProperties, ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { Province } from '@pixel-imperium/protocol'
import { Lock } from '../../album/Lock.tsx'
import { paperStyle } from '../../album/paper.ts'
import type { ProvinceState } from '../progress.ts'
import styles from './Worlds.module.css'

export function Worlds({ children, className }: { children: ReactNode; className?: string | undefined }) {
  return <div className={[styles.worlds, className].filter(Boolean).join(' ')}>{children}</div>
}

/** An open column in a province's paper, with its colour stripe across the top. */
export function World({
  index,
  children,
  className,
  style,
  labelledBy,
}: {
  /** The province's index in its campaign, for its paper. */
  index: number
  children: ReactNode
  className?: string | undefined
  style?: CSSProperties | undefined
  labelledBy?: string | undefined
}) {
  return (
    <section
      className={[styles.world, className].filter(Boolean).join(' ')}
      style={{ ...paperStyle(index), ...style }}
      aria-labelledby={labelledBy}
    >
      {children}
    </section>
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
  children,
  className,
}: {
  campaignId: string
  province: Province
  index: number
  state: ProvinceState
  /** E.g. "17/30", shown when the province is open. */
  count?: string | undefined
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
