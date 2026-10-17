import type { ReactNode } from 'react'
import type { PadButton } from './input.ts'
import { usePadOwner } from './owner.ts'
import styles from './Pad.module.css'

export type GlyphButton = Exclude<PadButton, 'Up' | 'Down' | 'Left' | 'Right'> | 'Move'

const icon = (path: ReactNode) => (
  <svg className={styles.icon} viewBox="0 0 12 12" aria-hidden="true">
    {path}
  </svg>
)

// The symbols are drawn: font glyphs for them sit off centre, each font differently.
const FACE: Record<GlyphButton, ReactNode> = {
  A: 'A',
  B: 'B',
  X: 'X',
  Y: 'Y',
  LB: 'LB',
  RB: 'RB',
  LT: 'LT',
  RT: 'RT',
  RS: 'RS',
  View: icon(
    <>
      <rect x="1" y="1" width="7" height="7" rx="1" />
      <path d="M4 11h6a1 1 0 0 0 1-1V4" />
    </>,
  ),
  Menu: icon(<path d="M2 3h8M2 6h8M2 9h8" />),
  Move: icon(<path d="M6 1v10M1 6h10" />),
}

/**
 * A controller button's badge, in Xbox colors, shown only in pad mode. `corner` pins it to the corner
 * of an icon button; `children` labels it, as a tag.
 */
export function PadGlyph({ button, corner = false, children }: { button: GlyphButton; corner?: boolean; children?: ReactNode }) {
  return (
    <span className={corner ? `${styles.glyph} ${styles.corner}` : styles.glyph} data-button={button} aria-hidden="true">
      <b data-wide={button.length === 2 || undefined}>{FACE[button]}</b>
      {children}
    </span>
  )
}

/** "⧉ Panel", hung off a side page while the board has the focus. */
export function PanelTag() {
  return usePadOwner() === 'board' ? (
    <span className={styles.panelTag}>
      <PadGlyph button="View">Panel</PadGlyph>
    </span>
  ) : null
}
