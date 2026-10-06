import { useAccount } from '../account.ts'
import { HandleForm } from './HandleForm.tsx'
import styles from './Me.module.css'

/** Shown in place of every page until a new account accepts or changes its provisional handle. */
export function HandlePicker() {
  const { account } = useAccount()
  if (!account) return null
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <h1>Pick your handle</h1>
        <p>
          It’s your public name here, and your profile lives at <code>/u/your_handle</code>. You can change it later
          in settings.
        </p>
        <HandleForm current={account.handle} submitLabel="Continue" allowUnchanged />
      </section>
    </main>
  )
}
