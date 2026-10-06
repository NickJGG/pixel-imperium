import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { type ImportOffer, acceptImport, deferImport, discardImport, useAccount } from './account.ts'
import styles from './App.module.css'

/** Offers to move this device's signed-out play into the account that just signed in, once it has a handle. */
export function ImportPrompt() {
  const { importOffer, account, needsHandle } = useAccount()
  return importOffer && account && !needsHandle && <Prompt offer={importOffer} handle={account.handle} />
}

function describe({ solved, inProgress }: ImportOffer): string {
  const parts = [solved > 0 && `${solved} solved`, inProgress > 0 && `${inProgress} in-progress`].filter(Boolean)
  return `${parts.join(' and ')} puzzle${solved + inProgress === 1 ? '' : 's'}`
}

function Prompt({ offer, handle }: { offer: ImportOffer; handle: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [confirmDiscard, setConfirmDiscard] = useState(false)

  useEffect(() => dialogRef.current?.showModal(), [])

  const add = async () => {
    setBusy(true)
    setFailed(false)
    try {
      await acceptImport()
      await router.invalidate()
    } catch {
      setFailed(true)
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="import-title"
      onCancel={e => {
        e.preventDefault()
        if (!busy) deferImport()
      }}
    >
      <h2 id="import-title">Bring your progress?</h2>
      <p>
        This device has {describe(offer)} from playing signed out. Add them to @{handle}?
      </p>
      {failed && <p role="alert">Couldn’t reach the server. Try again, or choose Not now.</p>}
      <div className={styles.dialogActions}>
        <button
          type="button"
          className={styles.ghost}
          disabled={busy}
          onClick={() => {
            if (!confirmDiscard) return setConfirmDiscard(true)
            discardImport()
            void router.invalidate()
          }}
        >
          {confirmDiscard ? 'Discard for good' : 'Discard'}
        </button>
        <button type="button" disabled={busy} onClick={deferImport}>
          Not now
        </button>
        <button type="button" className={styles.primary} disabled={busy} autoFocus onClick={() => void add()}>
          {busy ? 'Adding…' : 'Add'}
        </button>
      </div>
    </dialog>
  )
}
