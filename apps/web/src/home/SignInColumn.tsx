import type { CSSProperties } from 'react'
import { PROVIDERS, signIn } from '../auth.ts'
import { World } from '../campaign/worlds/Worlds.tsx'
import styles from './Home.module.css'

/** Home's Sign in, for a signed-out player in place of Profile and Settings: the account menu's pitch and providers. */
export function SignInColumn({ index, start, style }: { index: number; start: boolean; style: CSSProperties }) {
  return (
    <World index={index} labelledBy="home-signin" style={style} start={start}>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>Account</p>
          <h2 id="home-signin" className={styles.hero}>
            Sign in
          </h2>
          <p className={styles.line}>Sign in to earn foil and keep your stickers on any device.</p>
          <div className={styles.actions}>
            {PROVIDERS.map((p, i) => (
              <button
                key={p.id}
                type="button"
                data-variant={i === 0 ? 'primary' : 'paper'}
                data-pad-default={i === 0 || undefined}
                onClick={() => void signIn.social({ provider: p.id, callbackURL: window.location.href })}
              >
                Sign in with {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </World>
  )
}
