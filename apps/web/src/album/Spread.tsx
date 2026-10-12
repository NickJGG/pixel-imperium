import type { ReactNode } from 'react'
import type { Province, PuzzleSummary } from '@pixel-imperium/protocol'
import { CountPill } from './CountPill.tsx'
import { paperStyle } from './paper.ts'
import styles from './Spread.module.css'

export const SLOTS_PER_PAGE = 15

interface Props {
  province: Province
  /** The province's place in its campaign, for its paper colour. */
  index: number
  solved: number
  /** Puts the count in the province's colour with a check. */
  complete: boolean
  /** Printed in the foot, e.g. the flavour line. */
  caption?: ReactNode
  /** A "what's next" row in the foot, while the province is still being filled. */
  next?: ReactNode
  /** One slot, given the puzzle and its 1-based number. */
  slot: (puzzle: PuzzleSummary, number: number) => ReactNode
}

/** A province's two facing pages of slots, on its own paper. Stacks into one tall page on phones. */
export function Spread({ province, index, solved, complete, caption, next, slot }: Props) {
  const pages = [province.puzzles.slice(0, SLOTS_PER_PAGE), province.puzzles.slice(SLOTS_PER_PAGE)]
  const total = province.puzzles.length
  return (
    <section className={styles.spread} style={paperStyle(index)} aria-labelledby={`${province.id}-title`}>
      <div className={styles.page}>
        <header className={styles.head}>
          <div>
            <h1 id={`${province.id}-title`} className={styles.name}>
              {province.name}
            </h1>
            {province.theme && <p className={styles.theme}>{province.theme}</p>}
          </div>
        </header>
        <Slots puzzles={pages[0]!} first={1} slot={slot} />
      </div>
      <div className={styles.page}>
        <header className={styles.head}>
          <CountPill conquered={complete} className={styles.count}>
            {solved} / {total}
          </CountPill>
        </header>
        <Slots puzzles={pages[1]!} first={SLOTS_PER_PAGE + 1} slot={slot} />
      </div>
      {caption ? (
        <footer className={styles.foot}>
          <p className={styles.caption}>{caption}</p>
        </footer>
      ) : (
        next && <footer className={styles.foot}>{next}</footer>
      )}
    </section>
  )
}

function Slots({ puzzles, first, slot }: { puzzles: PuzzleSummary[]; first: number; slot: Props['slot'] }) {
  return (
    <ol className={styles.slots} start={first}>
      {puzzles.map((p, i) => (
        <li key={p.id}>{slot(p, first + i)}</li>
      ))}
    </ol>
  )
}
