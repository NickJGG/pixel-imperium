import type { ReactNode } from 'react'
import { usePadMode } from '../pad/mode.ts'
import type { BoardControls } from '../pad/controls.ts'
import { PadControls } from '../pad/PadControls.tsx'
import styles from './Play.module.css'

/**
 * The card under the side page: the board's tools (`children`), or in pad mode, where buttons stand in
 * for them, the controller's controls for whatever has the focus. Renders nothing when it would be empty.
 */
export function ControlsCard({ solved, children, ...board }: BoardControls & { solved: boolean; children?: ReactNode }) {
  const pad = usePadMode()
  if (!children && !pad) return null
  return (
    <section className={styles.controls} aria-label="Controls">
      {pad ? <PadControls solved={solved} {...board} /> : children}
    </section>
  )
}
