import type { CSSProperties } from 'react'
import { PixelArt } from '../campaign/PixelArt.tsx'
import styles from './Sticker.module.css'

interface Props {
  title: string
  width: number
  height: number
  palette: readonly (string | null)[]
  /** First solved without a hint. Stacks with `gold`. */
  foil?: boolean
  /** Slot 30, the province's hardest puzzle. Looks only. */
  gold?: boolean
  /** Imported and not yet replayed, so still on its backing paper. Never foil. */
  unverified?: boolean
  /** A Crest: the art cropped into a circle. */
  round?: boolean
  /** Degrees; see `tiltOf`. */
  tilt?: number
  className?: string | undefined
}

/** A die-cut sticker of a solved puzzle's picture. Size it with `width` on the sticker or its container. */
export function Sticker({ title, width, height, palette, foil, gold, unverified, round, tilt = 0, className }: Props) {
  const classes = [
    styles.sticker,
    foil && !unverified && styles.foil,
    gold && styles.gold,
    unverified && styles.unverified,
    round && styles.round,
    className,
  ]
  return (
    <span className={classes.filter(Boolean).join(' ')} style={{ '--tilt': `${tilt}deg` } as CSSProperties}>
      <PixelArt title={title} width={width} height={height} palette={palette} className={styles.art} />
    </span>
  )
}

/**
 * A sticker the viewer hasn't collected, face down: just its backing paper, shaped like the picture.
 * Someone else's sticker shows this way, since a palette is only ever released to its solver.
 */
export function StickerBack({ width, height, tilt = 0, className }: Pick<Props, 'width' | 'height' | 'tilt' | 'className'>) {
  return (
    <span
      className={[styles.sticker, styles.back, className].filter(Boolean).join(' ')}
      style={{ '--tilt': `${tilt}deg` } as CSSProperties}
    >
      <span className={styles.backing} style={{ aspectRatio: `${width} / ${height}` }} />
    </span>
  )
}

/** A resting tilt in [-3.5, 3.5] degrees that stays the same for a puzzle across renders. */
export function tiltOf(id: string): number {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) | 0
  return ((Math.abs(hash) % 71) - 35) / 10
}
