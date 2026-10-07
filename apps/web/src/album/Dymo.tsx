import type { CSSProperties, ReactNode } from 'react'
import styles from './Dymo.module.css'

interface Props {
  children: ReactNode
  /** Dark tape for a status ("Replaying"), pink for a toast ("+1 foil"). */
  tone?: 'dark' | 'pink'
  tilt?: number
  className?: string | undefined
}

/** A strip of embossed label tape. */
export function Dymo({ children, tone = 'dark', tilt = -1.5, className }: Props) {
  const classes = [styles.dymo, tone === 'pink' && styles.pink, className]
  return (
    <span className={classes.filter(Boolean).join(' ')} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      {children}
    </span>
  )
}
