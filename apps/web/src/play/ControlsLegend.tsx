import { padControls } from '../pad/controls.ts'
import { usePadMode } from '../pad/mode.ts'
import { PadGlyph } from '../pad/PadGlyph.tsx'
import styles from './Play.module.css'

const MOUSE = [
  ['Left drag', 'Fill'],
  ['Right drag', 'Cross'],
  ['Wheel', 'Zoom'],
  ['Space + drag', 'Pan'],
] as const

const TOUCH = [
  ['Drag', 'Fill or Cross'],
  ['Pinch', 'Zoom'],
  ['Drag clues', 'Pan'],
] as const

/** The rail's toolbar already wears these on its badges, and Menu has no button of its own in the rail. */
const ON_BADGES = new Set(['Y', 'LB', 'RB', 'Menu'])

const PAD = padControls('board', { lines: true, zoom: true, back: '' }).filter(
  ([buttons]) => !buttons.some(b => ON_BADGES.has(b)),
)

const PING = {
  mouse: ['Alt + click', 'Ping'],
  touch: ['Long-press', 'Ping'],
  pad: [['RS'], 'Ping'],
} as const

/** What the board does that no button in the rail says: for the mouse, touch, or in pad mode the controller. `ping` in a co-op. */
export function ControlsLegend({ ping = false }: { ping?: boolean }) {
  const pad = usePadMode()
  const mouse = ping ? [...MOUSE, PING.mouse] : MOUSE
  const touch = ping ? [...TOUCH, PING.touch] : TOUCH
  const padRows = ping ? [...PAD, PING.pad] : PAD
  if (pad) {
    return (
      <dl className={styles.legend}>
        {padRows.map(([buttons, action]) => (
          <div key={action}>
            <dt>
              {buttons.map(b => (
                <PadGlyph key={b} button={b} />
              ))}
            </dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    )
  }
  return (
    <>
      <dl className={`${styles.legend} ${styles.mouseOnly}`}>
        {mouse.map(([input, action]) => (
          <div key={action}>
            <dt>{input}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
      <dl className={`${styles.legend} ${styles.fingerOnly}`}>
        {touch.map(([input, action]) => (
          <div key={action}>
            <dt>{input}</dt>
            <dd>{action}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
