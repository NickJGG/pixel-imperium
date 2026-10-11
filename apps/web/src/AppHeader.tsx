import { Link } from '@tanstack/react-router'
import { AccountMenu } from './AccountMenu.tsx'
import { CrownMark, SoundButton, ThemeButton } from './Hud.tsx'
import { setPlaySlot } from './playSlot.ts'
import styles from './App.module.css'

/** The slim cobalt spine over /play, whose puzzle slot PlayPage fills with the way back and the puzzle. */
export function AppHeader() {
  return (
    <header className={styles.spine} data-surface="cobalt">
      <Link to="/" className={styles.logo}>
        <CrownMark className={styles.mark} />
        <span className={styles.wordmark}>
          <span>Pixel</span> Imperium
        </span>
      </Link>
      <span ref={setPlaySlot} className={styles.puzzle} />
      <span className={styles.tools}>
        <SoundButton className={styles.round} variant="flat" size="compact" />
        <ThemeButton className={styles.round} variant="flat" size="compact" />
        <AccountMenu />
      </span>
    </header>
  )
}
