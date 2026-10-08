import { type ReactNode, useSyncExternalStore } from 'react'
import { updateSettings, useSettings } from '../settings.ts'
import type { PlayStore } from './store.ts'
import { ToolToggle } from './ToolToggle.tsx'
import styles from './Play.module.css'

/**
 * The tools overlaid at the foot of the board card. `fitPlay` keeps the board clear of it.
 * `compact` packs it for the layout without the panel: icons only on touch, and `children` (Hint) at the end.
 */
export function ToolPill({
  store,
  compact = false,
  children,
}: {
  store: PlayStore
  compact?: boolean
  children?: ReactNode
}) {
  const canUndo = useSyncExternalStore(store.subscribe, () => store.getState().canUndo)
  const canRedo = useSyncExternalStore(store.subscribe, () => store.getState().canRedo)
  const { lockLine } = useSettings()
  return (
    <div className={compact ? `${styles.pill} ${styles.pillCompact}` : styles.pill} role="toolbar" aria-label="Tools">
      <ToolToggle store={store} compact={compact} />
      <span className={`${styles.pillSep} ${styles.touchOnly}`} />
      <button
        type="button"
        aria-pressed={lockLine}
        aria-label={compact ? 'Straight lines' : undefined}
        title="Drags stay in one row or column. Or hold Shift"
        onClick={() => updateSettings({ lockLine: !lockLine })}
      >
        <svg viewBox="0 0 10 10" aria-hidden="true">
          <path d="M1 5h8" />
        </svg>
        <span className={styles.toolLabel}>Straight lines</span>
      </button>
      <span className={styles.pillSep} />
      <button
        type="button"
        className={styles.pillIcon}
        aria-label="Undo"
        disabled={!canUndo}
        onClick={() => store.undo()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.pillIcon}
        aria-label="Redo"
        disabled={!canRedo}
        onClick={() => store.redo()}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
        </svg>
      </button>
      {children && (
        <>
          <span className={styles.pillSep} />
          {children}
        </>
      )}
    </div>
  )
}
