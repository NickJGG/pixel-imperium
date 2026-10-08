import { useSyncExternalStore } from 'react'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

/** Fill or Cross for touch and pen; the mouse picks with its buttons, so it's hidden without touch. */
export function ToolToggle({ store }: { store: PlayStore }) {
  const mode = useSyncExternalStore(store.subscribe, () => store.getState().mode)
  return (
    <div className={`${styles.seg} ${styles.touchOnly}`} role="group" aria-label="Touch tool">
      {(['fill', 'mark'] as const).map(m => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => store.setMode(m)}>
          {m === 'fill' ? <i className={styles.fillSwatch} aria-hidden="true" /> : <CrossIcon />}
          {m === 'fill' ? 'Fill' : 'Cross'}
        </button>
      ))}
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
