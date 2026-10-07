import { useAccount } from '../account.ts'
import { HandleForm } from './HandleForm.tsx'
import styles from './Me.module.css'

/** Shown in place of every page until a new account accepts or changes its provisional handle. */
export function HandlePicker() {
  const { account } = useAccount()
  if (!account) return null
  return (
    <main className={styles.page}>
      <section className={`${styles.card} ${styles.picker}`}>
        <h1 className={styles.srOnly}>Pick your handle</h1>
        <HandleForm current={account.handle} submitLabel="Write it on the cover" allowUnchanged nameplate />
        <p className={styles.hint}>It’s your public name here. You can change it later in Settings.</p>
      </section>
    </main>
  )
}
