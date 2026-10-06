import { type Settings, updateSettings, useSettings } from '../settings.ts'
import styles from './Play.module.css'

type AssistKey = Exclude<keyof Settings, 'theme'>

const assists: { key: AssistKey; label: string; title?: string }[] = [
  { key: 'fadeClues', label: 'Fade done clues' },
  { key: 'impossibleLines', label: 'Flag impossible' },
  { key: 'crosshair', label: 'Crosshair' },
  { key: 'autoMarkEmptyLines', label: 'Auto-mark empties', title: 'Takes effect next time a puzzle loads' },
]

export function AssistChips() {
  const settings = useSettings()
  return (
    <div className={styles.chips} role="group" aria-label="Assists">
      {assists.map(({ key, label, title }) => (
        <button
          key={key}
          type="button"
          aria-pressed={settings[key]}
          title={title}
          onClick={() => updateSettings({ [key]: !settings[key] })}
        >
          {settings[key] && (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
          {label}
        </button>
      ))}
    </div>
  )
}
