import type { CSSProperties, ReactNode } from 'react'
import styles from './Stamp.module.css'

interface Props {
  children: ReactNode
  tone?: 'pink' | 'ok'
  /** Slam down from 2.2× when it mounts. */
  thunk?: boolean
  /** Inked on a sticker of its own rather than straight onto the page, for a moment's news. */
  solid?: boolean
  tilt?: number
  className?: string | undefined
}

/** A round rubber stamp, e.g. "Page complete" or "New sticker!". Size it with `width`/`height`. */
export function Stamp({ children, tone = 'pink', thunk, solid, tilt = -12, className }: Props) {
  const classes = [styles.stamp, tone === 'ok' && styles.ok, thunk && styles.thunk, solid && styles.solid, className]
  return (
    <span className={classes.filter(Boolean).join(' ')} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      {children}
    </span>
  )
}
