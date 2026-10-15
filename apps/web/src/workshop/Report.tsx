import { type RefObject, useEffect, useRef, useState } from 'react'
import { postReport } from '../api.ts'
import { usePadContain } from '../pad/PadProvider.tsx'
import appStyles from '../App.module.css'
import styles from './Report.module.css'

const REASONS = ['Offensive picture', 'Offensive title or name', 'Spam', 'Something else'] as const

const MAX_REASON = 500

/** ⚑ Report as a flat link, raising a small sheet that asks why. Works signed out. */
export function ReportButton({ targetId, what }: { targetId: string; what: 'puzzle' | 'campaign' }) {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        data-variant="flat"
        data-size="compact"
        disabled={sent}
        onClick={() => setOpen(true)}
      >
        <span aria-hidden="true">⚑</span> {sent ? 'Reported' : 'Report'}
      </button>
      {open && (
        <ReportSheet
          targetId={targetId}
          what={what}
          restore={triggerRef}
          onSent={() => setSent(true)}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}

function ReportSheet({
  targetId,
  what,
  restore,
  onSent,
  onClose,
}: {
  targetId: string
  what: 'puzzle' | 'campaign'
  restore: RefObject<HTMLButtonElement | null>
  onSent: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [reason, setReason] = useState<string | null>(null)
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  useEffect(() => dialogRef.current?.showModal(), [])
  usePadContain(dialogRef, true, onClose, restore)

  const send = async () => {
    if (!reason) return
    setState('sending')
    const said = details.trim()
    try {
      await postReport({ targetId, reason: (said ? `${reason}: ${said}` : reason).slice(0, MAX_REASON) })
      setState('sent')
      onSent()
    } catch {
      setState('failed')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className={appStyles.dialog}
      aria-labelledby="report-title"
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
    >
      {state === 'sent' ? (
        <>
          <h2 id="report-title">Thanks for telling us</h2>
          <p>We’ll take a look at this {what}.</p>
          <div className={appStyles.dialogActions}>
            <button type="button" data-variant="primary" autoFocus onClick={onClose}>
              Close
            </button>
          </div>
        </>
      ) : (
        <form
          onSubmit={e => {
            e.preventDefault()
            void send()
          }}
        >
          <h2 id="report-title">Report this {what}</h2>
          <fieldset className={styles.reasons} disabled={state === 'sending'}>
            <legend>What’s wrong with it?</legend>
            {REASONS.map(r => (
              <label key={r}>
                <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} />
                {r}
              </label>
            ))}
          </fieldset>
          <textarea
            className={styles.details}
            aria-label="Anything else (optional)"
            placeholder="Anything else (optional)"
            maxLength={MAX_REASON - 40}
            rows={3}
            value={details}
            disabled={state === 'sending'}
            onChange={e => setDetails(e.target.value)}
          />
          {state === 'failed' && <p role="alert">Couldn’t send the report. Try again in a moment.</p>}
          <div className={appStyles.dialogActions}>
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" data-variant="primary" disabled={!reason || state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Report'}
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
