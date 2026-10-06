import styles from './Play.module.css'

function ClueLine({ line, className }: { line: number[]; className: string | undefined }) {
  return (
    <div className={className}>
      {line.length === 0 ? <span className={styles.zero}>0</span> : line.map((n, i) => <span key={i}>{n}</span>)}
    </div>
  )
}

export function RowClues({ rows }: { rows: number[][] }) {
  return (
    <div className={styles.rowClues} role="group" aria-label="Row clues">
      {rows.map((line, i) => (
        <ClueLine key={i} line={line} className={styles.rowLine} />
      ))}
    </div>
  )
}

/** Column clues stack their numbers vertically, last clue nearest the grid. */
export function ColClues({ cols }: { cols: number[][] }) {
  return (
    <div className={styles.colClues} role="group" aria-label="Column clues">
      {cols.map((line, i) => (
        <ClueLine key={i} line={line} className={styles.colLine} />
      ))}
    </div>
  )
}
