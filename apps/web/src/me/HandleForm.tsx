import { useEffect, useId, useState } from 'react'
import type { HandleProblem } from '@pixel-imperium/protocol'
import { saveHandle } from '../account.ts'
import { checkHandle } from '../api.ts'
import styles from './Me.module.css'

const MESSAGES: Record<HandleProblem, string> = {
  length: 'Use 3–20 characters.',
  characters: 'Letters, numbers and _ only.',
  reserved: 'That one’s reserved.',
  blocked: 'That one isn’t allowed.',
  taken: 'Someone already has that one.',
}

type Check =
  | { state: 'checking' }
  | { state: 'available' }
  | { state: 'unavailable'; reason: HandleProblem }
  /** The server couldn't be asked; saving still validates. */
  | { state: 'unknown' }

/** Mirrors the server's format rules so obvious mistakes show without a request. */
function formatProblem(handle: string): HandleProblem | null {
  if (handle.length < 3 || handle.length > 20) return 'length'
  return /^[a-z0-9_]+$/i.test(handle) ? null : 'characters'
}

function useHandleCheck(handle: string): Check {
  const [check, setCheck] = useState<Check>({ state: 'checking' })

  useEffect(() => {
    const problem = formatProblem(handle)
    if (problem) return setCheck({ state: 'unavailable', reason: problem })
    setCheck({ state: 'checking' })
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      checkHandle(handle, ctrl.signal).then(
        r => setCheck(r.available ? { state: 'available' } : { state: 'unavailable', reason: r.reason }),
        () => !ctrl.signal.aborted && setCheck({ state: 'unknown' }),
      )
    }, 300)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [handle])

  return check
}

interface Props {
  current: string
  submitLabel: string
  /** Lets the player keep `current` as is, confirming it. */
  allowUnchanged?: boolean
  onSaved?: (handle: string) => void
}

/** A handle input with a live availability check, saving through `saveHandle`. */
export function HandleForm({ current, submitLabel, allowUnchanged = false, onSaved }: Props) {
  const id = useId()
  const [value, setValue] = useState(current)
  const check = useHandleCheck(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const unchanged = value === current

  const submit = async () => {
    setSaving(true)
    setError(null)
    try {
      const problem = await saveHandle(value)
      if (problem) setError(MESSAGES[problem])
      else onSaved?.(value)
    } catch {
      setError('Couldn’t reach the server. Try again.')
    }
    setSaving(false)
  }

  const status =
    error ??
    (check.state === 'unavailable'
      ? MESSAGES[check.reason]
      : check.state === 'checking'
        ? 'Checking…'
        : check.state === 'available' && !unchanged
          ? 'Available.'
          : '')
  const blocked = check.state === 'unavailable' || check.state === 'checking' || (unchanged && !allowUnchanged)

  return (
    <form
      className={styles.handleForm}
      onSubmit={e => {
        e.preventDefault()
        if (!blocked && !saving) void submit()
      }}
    >
      <label htmlFor={id}>Handle</label>
      <div className={styles.handleInput}>
        <span aria-hidden="true">@</span>
        <input
          id={id}
          value={value}
          maxLength={20}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-describedby={`${id}-status`}
          aria-invalid={check.state === 'unavailable' || error !== null}
          onChange={e => {
            setValue(e.target.value.trim())
            setError(null)
          }}
        />
        <button type="submit" className={styles.primary} disabled={blocked || saving}>
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
      <p
        id={`${id}-status`}
        className={check.state === 'unavailable' || error ? styles.bad : styles.hint}
        aria-live="polite"
      >
        {status}
      </p>
    </form>
  )
}
