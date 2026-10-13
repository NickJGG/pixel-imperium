import { useEffect, useRef, useState } from 'react'
import { getSettings } from '../settings.ts'
import { usePadContain } from '../pad/PadProvider.tsx'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

interface Props {
  store: PlayStore
  /** On a solved puzzle the button reads "Replay". */
  solved: boolean
  disabled?: boolean
}

/** Clear (or Replay) behind an inline confirm, which Escape or a new board stroke cancels; red only in the confirm. */
export function ClearButton({ store, solved, disabled = false }: Props) {
  const [confirming, setConfirming] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  usePadContain(boxRef, confirming, () => setConfirming(false), buttonRef)

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

  const label = solved ? 'Replay' : 'Clear'

  if (!confirming) {
    return (
      <button
        ref={buttonRef}
        type="button"
        data-variant="paper"
        disabled={disabled}
        onClick={() => setConfirming(true)}
      >
        {solved ? <LoopIcon /> : <TrashIcon />}
        {label}
      </button>
    )
  }

  return (
    <div ref={boxRef} className={styles.confirm} role="group" aria-label={label}>
      <span>{solved ? 'Clear and replay?' : 'Clear the grid?'}</span>
      <button
        ref={confirmRef}
        type="button"
        data-variant="danger"
        onClick={() => {
          setConfirming(false)
          store.clear({ autoMarkEmptyLines: getSettings().autoMarkEmptyLines })
        }}
      >
        {label}
      </button>
      <button type="button" data-variant="paper" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  )
}

export function LoopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-4 4H3" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M6 6l1 14h10l1-14" />
    </svg>
  )
}
