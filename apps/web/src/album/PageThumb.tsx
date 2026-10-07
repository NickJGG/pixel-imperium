import { Lock } from './Lock.tsx'
import { paperStyle } from './paper.ts'
import { Stamp } from './Stamp.tsx'
import styles from './PageThumb.module.css'

interface Props {
  name: string
  /** The province's place in its campaign, for its paper colour. */
  index: number
  /** Whether each slot, in order, holds a sticker. */
  filled: readonly boolean[]
  locked: boolean
  complete: boolean
}

/** A province's pages in miniature: a dot per slot, lit once it holds a sticker. Decorative; label its link. */
export function PageThumb({ name, index, filled, locked, complete }: Props) {
  const solved = filled.filter(Boolean).length
  return (
    <span className={styles.thumb} style={paperStyle(index)} data-locked={locked || undefined} aria-hidden="true">
      <b className={styles.name}>{name}</b>
      <span className={styles.dots}>
        {filled.map((on, i) => (
          <i key={i} data-on={on || undefined} />
        ))}
      </span>
      <small className={styles.count}>
        {locked ? (
          <>
            <Lock />
            Locked
          </>
        ) : (
          `${solved}/${filled.length}`
        )}
      </small>
      {complete && <Stamp className={styles.stamp}>Complete</Stamp>}
    </span>
  )
}
