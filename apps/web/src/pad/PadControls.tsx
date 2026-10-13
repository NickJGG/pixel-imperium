import { type BoardControls, type Control, padControls } from './controls.ts'
import { PadGlyph } from './PadGlyph.tsx'
import { usePadMode } from './mode.ts'
import { type PadOwner, usePadOwner } from './owner.ts'
import styles from './Pad.module.css'

/** The controls for whatever the controller drives now, or for `owner` when given. Pad mode only. */
export function PadControls({ solved, owner, ...board }: BoardControls & { solved: boolean; owner?: PadOwner }) {
  const pad = usePadMode()
  const focused = usePadOwner()
  if (!pad) return null
  const now = owner ?? focused
  return (
    <ul className={styles.list} aria-hidden="true">
      {padControls(solved && now !== 'scope' ? 'solved' : now, board).map(([buttons, action]) => (
        <li key={action}>
          {buttons.map(b => (
            <PadGlyph key={b} button={b} />
          ))}
          {action}
        </li>
      ))}
    </ul>
  )
}

/** One line under a board with no room for the controls card: the two buttons that matter now. */
export function PadStrip() {
  const pad = usePadMode()
  const owner = usePadOwner()
  if (!pad) return null
  const controls: Control[] =
    owner === 'board'
      ? [
          [['A'], 'Fill'],
          [['X'], 'Cross'],
        ]
      : [
          [['A'], 'Select'],
          [['B'], owner === 'scope' ? 'Close' : 'Back'],
        ]
  return (
    <p className={styles.strip} aria-hidden="true">
      {controls.map(([[button], action]) => (
        <PadGlyph key={action} button={button!}>
          {action}
        </PadGlyph>
      ))}
    </p>
  )
}
