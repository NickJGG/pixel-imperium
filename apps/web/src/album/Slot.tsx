import type { CSSProperties, ReactNode } from 'react'
import { Lock } from './Lock.tsx'
import styles from './Slot.module.css'

interface Props {
  /** 1-based position on the province's pages. */
  number: number
  /** Printed faintly behind the number as a grid of this many columns. */
  width: number
  height: number
  /** Percent filled in an unsolved, started puzzle. */
  started?: number | undefined
  /** The slot the player is due to fill; it pulses. */
  next?: boolean
  gold?: boolean
  /** On a locked page: no number, just the lock. */
  locked?: boolean
  /** The sticker, once solved. */
  children?: ReactNode
  className?: string | undefined
}

/** A numbered space on a province page, waiting for its sticker. */
export function Slot({ number, width, height, started, next, gold, locked, children, className }: Props) {
  if (children) return <span className={[styles.slot, styles.filled, className].filter(Boolean).join(' ')}>{children}</span>

  const classes = [styles.slot, next && styles.next, gold && styles.gold, locked && styles.locked, className]
  return (
    <span
      className={classes.filter(Boolean).join(' ')}
      style={{ '--g': width } as CSSProperties}
      data-started={started === undefined ? undefined : `${Math.round(started)}%`}
    >
      {locked ? (
        <Lock className={styles.lock} />
      ) : (
        <>
          <b>{number}</b>
          <small>{gold ? 'Gold' : `${width}×${height}`}</small>
        </>
      )}
    </span>
  )
}
