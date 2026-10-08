import { useEffect, useRef, useState } from 'react'
import type { Cell } from '@pixel-imperium/nonogram'
import type { HintResponse } from '@pixel-imperium/protocol'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

interface Props {
  store: PlayStore
  /** Foil is still on the table, so the first hint asks before giving it up. */
  confirmFirst: boolean
  /** Shown under the confirm. */
  note?: string
  request: (cells: readonly Cell[]) => Promise<HintResponse | null>
  onError: (failed: boolean) => void
}

/** Asks `request` for a hint on the grid as it stands; the store shows it until the next edit. */
export function HintButton({ store, confirmFirst, note, request, onError }: Props) {
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!confirming) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setConfirming(false)
    window.addEventListener('keydown', onKey)
    const unsubscribe = store.subscribe(() => store.strokeActive && setConfirming(false))
    return () => {
      window.removeEventListener('keydown', onKey)
      unsubscribe()
    }
  }, [confirming, store])

  const hint = async () => {
    setConfirming(false)
    setPending(true)
    onError(false)
    const { cells } = store.getState()
    try {
      const nudge = await request(cells)
      // A grid edited while the request was out has moved past the hint.
      if (nudge && store.getState().cells === cells) store.showHint(nudge)
    } catch {
      onError(true)
    } finally {
      setPending(false)
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        data-variant="blue"
        disabled={pending}
        onClick={() => (confirmFirst ? setConfirming(true) : void hint())}
      >
        <BulbIcon />
        Hint
      </button>
    )
  }

  return (
    <div className={styles.confirm} role="group" aria-label="Hint">
      <span>Using a hint means this sticker won't be foil.</span>
      <button ref={confirmRef} type="button" data-variant="primary" onClick={() => void hint()}>
        Use a hint
      </button>
      <button type="button" className={styles.ghost} onClick={() => setConfirming(false)}>
        Cancel
      </button>
      {note && <span className={styles.note}>{note}</span>}
    </div>
  )
}

export function hintText({ kind, index }: HintResponse, cells: readonly Cell[], width: number): string {
  const where = `row ${Math.floor(index / width) + 1}, column ${(index % width) + 1}`
  if (kind === 'reveal') return `Hint: ${where} is filled`
  return `Hint: ${where} shouldn't be ${cells[index] === 'marked' ? 'crossed' : 'filled'}`
}

function BulbIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
    </svg>
  )
}
