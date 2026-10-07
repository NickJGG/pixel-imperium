import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { type ImportOffer, acceptImport, deferImport, discardImport, useAccount } from './account.ts'
import { Sticker, tiltOf } from './album/Sticker.tsx'
import { useCurrentCampaign } from './campaign/last-campaign.ts'
import { signedOutStorage } from './play/progress-storage.ts'
import styles from './App.module.css'

/** Offers to move this device's signed-out play into the account that just signed in, once it has a handle. */
export function ImportPrompt() {
  const { importOffer, account, needsHandle } = useAccount()
  return importOffer && account && !needsHandle && <Prompt offer={importOffer} handle={account.handle} />
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

function describe({ solved, inProgress }: ImportOffer): string {
  const parts = [solved > 0 && plural(solved, 'sticker'), inProgress > 0 && `${plural(inProgress, 'puzzle')} in progress`]
  return parts.filter(Boolean).join(' and ')
}

/** Up to five of the device's latest stickers in the campaign last shown. */
function Pile() {
  const campaign = useCurrentCampaign()
  const stickers = (campaign?.provinces.flatMap(p => p.puzzles) ?? [])
    .flatMap(p => {
      const palette = signedOutStorage.loadSolved(p.id) && signedOutStorage.loadPalette(p.id, p.width * p.height)
      return palette ? [{ ...p, palette }] : []
    })
    .slice(-5)
  if (stickers.length === 0) return null
  return (
    <div className={styles.pile} aria-hidden="true">
      {stickers.map(p => (
        <Sticker key={p.id} title={p.title} width={p.width} height={p.height} palette={p.palette} tilt={tiltOf(p.id) * 2} />
      ))}
    </div>
  )
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
      className={`${styles.dialog} ${styles.taped}`}
      aria-labelledby="import-title"
      onCancel={e => {
        e.preventDefault()
        if (!busy) deferImport()
      }}
    >
      <Pile />
      <h2 id="import-title">Bring your stickers?</h2>
      <p>
        This device has {describe(offer)} from playing signed out. Add them to @{handle}’s album?
      </p>
      {failed && <p role="alert">Couldn’t reach the server. Try again, or choose Not now.</p>}
      <div className={styles.dialogActions}>
        <button
          type="button"
          data-variant="ghost"
          className={styles.leading}
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
        <button type="button" data-variant="primary" disabled={busy} autoFocus onClick={() => void add()}>
          {busy ? 'Adding…' : 'Add to my album'}
        </button>
      </div>
    </dialog>
  )
}
