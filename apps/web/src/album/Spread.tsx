import type { ReactNode } from 'react'
import type { Province, PuzzleSummary } from '@pixel-imperium/protocol'
import { paperStyle } from './paper.ts'
import { Stamp } from './Stamp.tsx'
import styles from './Spread.module.css'

export const SLOTS_PER_PAGE = 15

/** The album page that slot `number` (1-based) of province `index` is printed on; the first province starts at p. 1. */
export const pageOf = (index: number, number: number) => 1 + 2 * index + (number > SLOTS_PER_PAGE ? 1 : 0)

interface Props {
  province: Province
  /** The province's place in its campaign, for its paper colour and page numbers. */
  index: number
  solved: number
  /** Stamps the spread "Page complete". */
  complete: boolean
  /** Printed under the stamp, e.g. the flavour line. */
  caption?: ReactNode
  /** Someone else's pages: no call to fill them. */
  readOnly?: boolean
  /** One slot, given the puzzle and its 1-based number. */
  slot: (puzzle: PuzzleSummary, number: number) => ReactNode
}

/** A province's two facing pages of slots, on its own paper. Stacks into one tall page on phones. */
export function Spread({ province, index, solved, complete, caption, readOnly = false, slot }: Props) {
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
        <p className={styles.pageNo}>p. {pageOf(index, 1)}</p>
      </div>
      <div className={styles.page}>
        <header className={styles.head}>
          <p className={styles.theme}>
            {complete
              ? 'Every slot filled.'
              : readOnly
                ? ''
                : `Fill both pages to conquer ${province.name.replace(/^The /, 'the ')}.`}
          </p>
          <span className={styles.count}>
            {solved} / {total}
          </span>
        </header>
        <Slots puzzles={pages[1]!} first={SLOTS_PER_PAGE + 1} slot={slot} />
        <p className={styles.pageNo}>p. {pageOf(index, SLOTS_PER_PAGE + 1)}</p>
      </div>
      {(complete || caption) && (
        <footer className={styles.foot}>
          {caption && <p className={styles.caption}>{caption}</p>}
          {complete && <Stamp className={styles.stamp}>Page complete</Stamp>}
        </footer>
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
