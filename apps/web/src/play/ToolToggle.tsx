import { useSyncExternalStore } from 'react'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

/**
 * Fill or Cross for touch and pen; the mouse picks with its buttons, so it's hidden without touch.
 * `compact` lets the pill drop the labels, so the buttons carry their names themselves.
 */
export function ToolToggle({ store, compact = false }: { store: PlayStore; compact?: boolean }) {
  const mode = useSyncExternalStore(store.subscribe, () => store.getState().mode)
  return (
    <div className={`${styles.seg} ${styles.touchOnly}`} role="group" aria-label="Touch tool">
      {(['fill', 'mark'] as const).map(m => {
        const label = m === 'fill' ? 'Fill' : 'Cross'
        return (
          <button
            key={m}
            type="button"
            data-variant="flat"
            data-size="compact"
            aria-pressed={mode === m}
            aria-label={compact ? label : undefined}
            title={compact ? label : undefined}
            onClick={() => store.setMode(m)}
          >
            {m === 'fill' ? <i className={styles.fillSwatch} aria-hidden="true" /> : <CrossIcon />}
            <span className={styles.toolLabel}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  )
}
