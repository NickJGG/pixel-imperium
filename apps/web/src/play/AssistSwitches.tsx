import { updateSettings, useSettings } from '../settings.ts'
import { assists } from './AssistChips.tsx'
import styles from './Play.module.css'

/** The assists as a column of labelled switches, for the puzzle panel. */
export function AssistSwitches() {
  const settings = useSettings()
  return (
    <div className={styles.switches} role="group" aria-label="Assists">
      {assists.map(({ key, label, title }) => (
        <button
          key={key}
          type="button"
          data-variant="flat"
          role="switch"
          aria-checked={settings[key]}
          title={title}
          onClick={() => updateSettings({ [key]: !settings[key] })}
        >
          {label}
          <i aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
