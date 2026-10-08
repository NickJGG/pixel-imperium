import { memo } from 'react'
import type { LineHint } from './line-hints.ts'
import styles from './Play.module.css'

export interface ClueAssists {
  fade: boolean
  impossible: boolean
}

interface PanelProps {
  lines: number[][]
  hints: readonly LineHint[]
  active: number | null
  assists: ClueAssists
  /** Lines a Lesson step points at. */
  highlight?: readonly number[] | undefined
}

const ClueLine = memo(function ClueLine({
  line,
  hint,
  active,
  highlighted,
  assists,
  className,
}: {
  line: number[]
  hint: LineHint | undefined
  active: boolean
  highlighted: boolean
  assists: ClueAssists
  className: string | undefined
}) {
  const impossible = assists.impossible && hint?.impossible
  const classes = [className, impossible && styles.impossible, active && styles.active, highlighted && styles.highlighted]
    .filter(Boolean)
    .join(' ')
  return (
    <div className={classes}>
      {line.length === 0 ? (
        <span className={styles.zero}>0</span>
      ) : (
        line.map((n, i) => (
          <span key={i} className={assists.fade && hint?.done[i] ? styles.done : undefined}>
            {n}
          </span>
        ))
      )}
    </div>
  )
})

/** Panels are clipped to the fit box and follow the board's zoom and pan through its CSS variables. */
export function RowClues({ lines, hints, active, assists, highlight }: PanelProps) {
  return (
    <div className={styles.rowStrip} data-zone="rows">
      <div className={styles.rowClues} role="group" aria-label="Row clues">
        {lines.map((line, i) => (
          <ClueLine
            key={i}
            line={line}
            hint={hints[i]}
            active={active === i}
            highlighted={highlight?.includes(i) ?? false}
            assists={assists}
            className={styles.rowLine}
          />
        ))}
      </div>
    </div>
  )
}

/** Column clues stack their numbers vertically, last clue nearest the grid. */
export function ColClues({ lines, hints, active, assists, highlight }: PanelProps) {
  return (
    <div className={styles.colStrip} data-zone="cols">
      <div className={styles.colClues} role="group" aria-label="Column clues">
        {lines.map((line, i) => (
          <ClueLine
            key={i}
            line={line}
            hint={hints[i]}
            active={active === i}
            highlighted={highlight?.includes(i) ?? false}
            assists={assists}
            className={styles.colLine}
          />
        ))}
      </div>
    </div>
  )
}
