import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import type { Paper } from '../album/paper.ts'
import { PROVIDERS } from '../auth.ts'
import { World } from '../campaign/worlds/Worlds.tsx'
import { CrownMark } from '../Hud.tsx'
import { THEMES, useLinkedAccounts } from '../me/SettingsPage.tsx'
import { useSettings } from '../settings.ts'
import styles from './Home.module.css'

const monthYear = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })

/** Bar widths, in pixels, that stay the same for a handle. */
const barcodeOf = (handle: string): number[] =>
  Array.from({ length: 34 }, (_, i) => 1 + ((handle.charCodeAt(i % handle.length) * (i + 7)) % 3))

/**
 * Home's way into Settings: one line and the button, with your album card beside them showing what's set, in the
 * column's own paper and tab.
 */
export function SettingsColumn({
  handle,
  joinedAt,
  paper,
  start,
  style,
}: {
  handle: string
  /** From the profile; `undefined` until it has loaded. */
  joinedAt: string | undefined
  paper: Paper
  start: boolean
  style: CSSProperties
}) {
  const { linked } = useLinkedAccounts()
  const { sound, theme } = useSettings()
  const signsIn =
    linked === null
      ? '…'
      : linked === 'failed'
        ? '—'
        : PROVIDERS.filter(p => linked.some(a => a.providerId === p.id))
            .map(p => p.label)
            .join(', ') || '—'
  const fields = [
    ['Member since', joinedAt ? monthYear.format(new Date(joinedAt)) : '…'],
    ['Signs in with', signsIn],
    ['Sound', sound ? 'On' : 'Off'],
    ['Theme', THEMES.find(t => t.value === theme)?.label ?? theme],
  ]

  return (
    <World paper={paper} labelledBy="home-settings" style={style} start={start}>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>Handle · Play · Sign-in</p>
          <h2 id="home-settings" className={styles.hero}>
            Settings
          </h2>
          <p className={styles.line}>Your handle, this device’s sound and theme, and how you sign in.</p>
          <div className={styles.actions}>
            <Link to="/settings" data-variant="paper" data-pad-default>
              Open settings
            </Link>
          </div>
        </div>
        <div className={styles.picture}>
          <div className={styles.card}>
            <p className={styles.cardTop}>
              <CrownMark className={styles.cardMark} />
              <span className={styles.kicker}>Pixel Imperium · Album card</span>
            </p>
            <p className={styles.cardName}>@{handle}</p>
            <dl className={styles.cardFields}>
              {fields.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <span className={styles.barcode} aria-hidden="true">
              {barcodeOf(handle).map((w, i) => (
                <i key={i} style={{ width: w }} />
              ))}
            </span>
          </div>
        </div>
      </div>
    </World>
  )
}
