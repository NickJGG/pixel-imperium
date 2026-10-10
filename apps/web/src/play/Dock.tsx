import type { CSSProperties, ReactNode, Ref } from 'react'
import { PadStrip } from '../pad/PadControls.tsx'
import { PageSheet } from './PageSheet.tsx'
import type { PlayStore } from './store.ts'
import { ToolPill } from './ToolPill.tsx'
import styles from './Play.module.css'

interface Props {
  store: PlayStore
  /** Inert once solved; it stays under the after sheet so the board never refits under the sticker. */
  solved: boolean
  hint: ReactNode
  paper: CSSProperties
  /** The page sheet's contents. */
  page: ReactNode
  /** Floats over the stage just above the dock: why there's no hint. */
  note: ReactNode
  ref: Ref<HTMLDivElement>
}

/** The tools along the bottom where there's no rail, with the page sheet behind the sliders at the end. */
export function Dock({ store, solved, hint, paper, page, note, ref }: Props) {
  return (
    <div ref={ref} className={styles.playDock} inert={solved}>
      <PadStrip />
      <div className={styles.dockRow}>
        <ToolPill store={store} compact>
          {hint}
        </ToolPill>
        <PageSheet store={store} solved={solved} paper={paper}>
          {page}
        </PageSheet>
      </div>
      <p className={styles.dockNote} role="status">
        {note}
      </p>
    </div>
  )
}
