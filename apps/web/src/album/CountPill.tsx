import type { ReactNode } from 'react'
import { CheckIcon } from './icons.tsx'
import styles from './CountPill.module.css'

/**
 * When an `unveil`'s check slams down, for a sound to land with it: its 380ms slam starts 250ms in and lands early
 * on its overshooting curve.
 */
export const UNVEIL_LANDS_MS = 370

interface Props {
  children: ReactNode
  /** In the province's `--tab` colour with a check. */
  conquered?: boolean | undefined
  /** Gold foil with a check, e.g. "Album complete". */
  tone?: 'gold' | undefined
  /** Plays the conquest: fills from `--ink` to `--tab`, then the check slams in. */
  unveil?: boolean | undefined
  className?: string | undefined
}

/**
 * A count in a pill, e.g. "17 / 30": `--ink` while in progress, the province's colour with a check once conquered.
 * Size it with `font-size`.
 */
export function CountPill({ children, conquered, tone, unveil, className }: Props) {
  const checked = conquered || tone === 'gold'
  return (
    <span
      className={className ? `${styles.pill} ${className}` : styles.pill}
      data-conquered={conquered || undefined}
      data-tone={tone}
      data-unveil={(conquered && unveil) || undefined}
    >
      {checked && <CheckIcon />}
      {children}
    </span>
  )
}
