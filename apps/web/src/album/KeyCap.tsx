import type { ReactNode } from 'react'
import styles from './KeyCap.module.css'

/** A keyboard key's badge, e.g. Esc; hidden in pad mode, where PadGlyph shows the controller's. */
export function KeyCap({ children }: { children: ReactNode }) {
  return (
    <kbd className={styles.keycap} aria-hidden="true">
      {children}
    </kbd>
  )
}
