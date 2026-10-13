import { useSyncExternalStore } from 'react'
import { PadGlyph } from '../pad/PadGlyph.tsx'
import { updateSettings, useSettings } from '../settings.ts'
import type { PlayStore } from './store.ts'
import { ToolToggle } from './ToolToggle.tsx'
import styles from './Play.module.css'

/**
 * The rail's tools: Fill | Cross on its own row for touch, then Straight lines, Undo and Redo, each wearing
 * its shortcut in the corner: a keycap with a mouse, the controller's button in pad mode. `lines` off drops
 * Straight lines, for a board that fixes it.
 */
export function RailTools({ store, lines = true }: { store: PlayStore; lines?: boolean }) {
  const canUndo = useSyncExternalStore(store.subscribe, () => store.getState().canUndo)
  const canRedo = useSyncExternalStore(store.subscribe, () => store.getState().canRedo)
  const { lockLine } = useSettings()
  return (
    <div className={styles.railTools} role="toolbar" aria-label="Tools">
      <ToolToggle store={store} joined />
      <div className={styles.railToolRow}>
        {lines && (
          <button
            type="button"
            className={styles.railLines}
            aria-pressed={lockLine}
            title="Drags stay in one row or column"
            onClick={() => updateSettings({ lockLine: !lockLine })}
          >
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M1 5h8" />
            </svg>
            Straight lines
            <Keycap>Shift</Keycap>
            <PadGlyph button="Y" corner />
          </button>
        )}
        <button type="button" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={() => store.undo()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
          <Keycap>Ctrl Z</Keycap>
          <PadGlyph button="LB" corner />
        </button>
        <button type="button" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={() => store.redo()}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
          <Keycap>Ctrl Y</Keycap>
          <PadGlyph button="RB" corner />
        </button>
      </div>
    </div>
  )
}

/** A keyboard shortcut's badge in a button's corner, in the controller glyphs' look; shown only with a mouse. */
function Keycap({ children }: { children: string }) {
  return (
    <kbd className={styles.keycap} aria-hidden="true">
      {children}
    </kbd>
  )
}
