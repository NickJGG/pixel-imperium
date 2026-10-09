import type { Tier } from '@pixel-imperium/protocol'
import { type CSSProperties, type ReactNode, useEffect, useRef } from 'react'
import { useSettings } from '../settings.ts'
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
  /** A started board's grid, `.#x` encoded; drawn in place of the number and size. */
  cells?: string | undefined
  /** The slot the player is due to fill; it pulses. */
  next?: boolean
  gold?: boolean
  /** Shown as pips on an unsolved, unlocked slot. */
  tier?: Tier | undefined
  /** On a locked page: no number, just the lock. */
  locked?: boolean
  /** The sticker, once solved. */
  children?: ReactNode
  className?: string | undefined
}

/** A numbered space on a province page, waiting for its sticker. */
const PIPS: Record<Tier, number> = { easy: 1, medium: 2, hard: 3 }

export function Slot({ number, width, height, started, cells, next, gold, tier, locked, children, className }: Props) {
  if (children) {
    return (
      <span className={[styles.slot, styles.filled, className].filter(Boolean).join(' ')} style={{ '--ar': width / height } as CSSProperties}>
        {children}
      </span>
    )
  }

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
          {tier && (
            <span className={styles.pips} aria-hidden="true">
              {[1, 2, 3].map(n => (
                <i key={n} className={n <= PIPS[tier] ? styles.on : undefined} />
              ))}
            </span>
          )}
          {cells ? (
            <Board cells={cells} width={width} height={height} />
          ) : (
            <>
              <b>{number}</b>
              <small>{gold ? 'Gold' : `${width}×${height}`}</small>
            </>
          )}
        </>
      )}
    </span>
  )
}

/** The filled cells of a board in progress, one canvas pixel per cell in the board's own colours. */
function Board({ cells, width, height }: { cells: string; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const { theme } = useSettings()

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const css = getComputedStyle(canvas)
    ctx.fillStyle = css.getPropertyValue('--board-bg').trim()
    ctx.fillRect(0, 0, width, height)
    ctx.fillStyle = css.getPropertyValue('--board-fill').trim()
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === '#') ctx.fillRect(i % width, Math.floor(i / width), 1, 1)
    }
  }, [cells, width, height, theme])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={styles.board}
      style={{ '--ar': width / height } as CSSProperties}
      aria-hidden="true"
    />
  )
}
