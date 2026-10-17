import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { ProgressStorage } from '../play/progress-storage.ts'
import type { ContinueAt } from './progress.ts'
import { SlotFace } from './PuzzleSlot.tsx'
import { doorSlot } from './worlds/names.ts'
import styles from '../home/Home.module.css'

/**
 * The puzzle due next and Continue (Start, before anything's solved), on a campaign's column and in the menu.
 * `children` join Continue in its row, as the column's Open. In the `menu`, Continue is where the panel's focus lands
 * when there's no trail to take it, rather than the page's pad default.
 */
export function NextUpCard({
  next,
  storage,
  menu = false,
  children,
}: {
  next: ContinueAt
  storage: ProgressStorage
  menu?: boolean
  children?: ReactNode
}) {
  const { puzzle } = next
  return (
    <>
      <div className={styles.next}>
        <Link
          to="/play/$id"
          params={{ id: puzzle.id }}
          className={styles.nextSlot}
          {...doorSlot(puzzle.id)}
          tabIndex={-1}
          aria-hidden="true"
        >
          <SlotFace puzzle={puzzle} number={next.number} storage={storage} next />
        </Link>
        <div className={styles.nextText}>
          <div className={styles.nextHead}>
            <span className={styles.kicker}>Next up</span>
            <span className={styles.kicker}>
              {puzzle.width}×{puzzle.height}
            </span>
          </div>
          <p className={styles.nextName}>{puzzle.title}</p>
          <p className={styles.sub}>
            {next.province.name} · #{next.number}
          </p>
        </div>
      </div>
      <div className={styles.actions}>
        <Link
          to="/play/$id"
          params={{ id: puzzle.id }}
          data-variant="primary"
          data-pad-default={!menu || undefined}
          data-menu-focus={menu || undefined}
        >
          {next.fresh ? 'Start' : 'Continue'}
        </Link>
        {children}
      </div>
    </>
  )
}
