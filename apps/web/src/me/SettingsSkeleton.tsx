import { PROVIDERS } from '../auth.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { Bar, SrLoading } from '../skeleton/Skeleton.tsx'
import { THEMES } from './SettingsPage.tsx'
import styles from './Me.module.css'

/**
 * Settings while the account settles: every heading, label and button as the page has them, inert, and the
 * handle, the switch and each provider's state as bars.
 */
export function SettingsSkeleton() {
  useAnnounceSkeleton()
  return (
    <main className={styles.page} aria-busy="true">
      <SrLoading />
      <Worlds>
        <World paper="marches" className={styles.cover}>
          <div className={styles.column} data-surface="cobalt" inert>
            <p className={styles.kicker}>Settings · Handle</p>
            <Bar w="70%" h={52} />
            <p className={styles.soft}>
              Your album lives at <Bar w={120} h={16} style={{ display: 'inline-block', verticalAlign: 'middle' }} />
            </p>
            <button type="button" className={styles.start}>
              Change handle
            </button>
          </div>
        </World>

        <World paper="coast">
          <div className={styles.column} inert>
            <p className={styles.kicker}>This device</p>
            <h2 className={styles.name}>Play</h2>
            <div className={styles.line}>
              <span>Sound effects</span>
              <Bar w={52} h={30} pill />
            </div>
            <div className={styles.line}>
              <span>Album</span>
              <span className={styles.seg}>
                {THEMES.map(t => (
                  <button key={t.value} type="button" data-variant="flat" data-size="compact">
                    {t.label}
                  </button>
                ))}
              </span>
            </div>
            <p className={styles.soft}>Saved on this device only.</p>
          </div>
        </World>

        <World paper="capital">
          <div className={styles.column} inert>
            <p className={styles.kicker}>Account</p>
            <h2 className={styles.name}>Sign-in methods</h2>
            <ul className={styles.providers}>
              {PROVIDERS.map(p => (
                <li key={p.id}>
                  <span>{p.label}</span>
                  <Bar w={64} h={36} pill />
                </li>
              ))}
            </ul>
            <div className={styles.line}>
              <span className={styles.soft}>Your stickers stay saved to your album.</span>
              <button type="button">Sign out</button>
            </div>
          </div>
        </World>

        <World paper="throne">
          <div className={styles.column} inert>
            <p className={styles.kicker}>Account</p>
            <h2 className={styles.name}>Delete account</h2>
            <p className={styles.soft}>Removes your account and every sticker. This can’t be undone.</p>
            <button type="button" data-variant="danger" className={styles.start}>
              Delete account
            </button>
          </div>
        </World>
      </Worlds>
    </main>
  )
}
