import type { CSSProperties, HTMLAttributes, ReactNode } from 'react'
import styles from './Dymo.module.css'

interface Props extends Omit<HTMLAttributes<HTMLSpanElement>, 'className'> {
  children: ReactNode
  /** Dark tape for a status ("Replaying"), pink for a toast ("+1 foil"). */
  tone?: 'dark' | 'pink'
  tilt?: number
  className?: string | undefined
}

/** A strip of embossed label tape. */
export function Dymo({ children, tone = 'dark', tilt = -1.5, className, style, ...rest }: Props) {
  const classes = [styles.dymo, tone === 'pink' && styles.pink, className]
  return (
    <span {...rest} className={classes.filter(Boolean).join(' ')} style={{ '--tilt': `${tilt}deg`, ...style } as CSSProperties}>
      {children}
    </span>
  )
}
