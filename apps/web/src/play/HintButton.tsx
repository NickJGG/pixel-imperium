import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { Cell } from '@pixel-imperium/nonogram'
import type { HintResponse } from '@pixel-imperium/protocol'
import { usePadContain } from '../pad/PadProvider.tsx'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

interface Props {
  store: PlayStore
  /** Foil is still on the table, so the first hint asks before giving it up. */
  confirmFirst: boolean
  /** Shown under the confirm, or with `stakes`, between the button and the card. */
  note?: ReactNode
  /** With `stakes`, said under the confirm's question. */
  confirmNote?: string
  /** The confirm opens above the button instead of taking its place, so a toolbar doesn't reflow; the toolbar may hide the label. */
  popover?: boolean
  /**
   * The rail's layout: the button stays put with `note` and then this card under it, which the confirm
   * takes over. What's at stake in the card; null for nothing.
   */
  stakes?: ReactNode
  request: (cells: readonly Cell[]) => Promise<HintResponse | null>
  onError: (failed: boolean) => void
}

/** Asks `request` for a hint on the grid as it stands; the store shows it until the next edit. */
export function HintButton({ store, confirmFirst, note, confirmNote, popover = false, stakes, request, onError }: Props) {
  const card = stakes !== undefined
  const [confirming, setConfirming] = useState(false)
  const [pending, setPending] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)
  const anchorRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  usePadContain(boxRef, confirming, () => setConfirming(false), buttonRef)

  useEffect(() => {
    if (!confirming) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setConfirming(false)
    }
    const onDown = (e: PointerEvent) => !anchorRef.current?.contains(e.target as Node) && setConfirming(false)
    window.addEventListener('keydown', onKey)
    if (popover) window.addEventListener('pointerdown', onDown)
    const unsubscribe = store.subscribe(() => store.strokeActive && setConfirming(false))
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      unsubscribe()
    }
  }, [confirming, popover, store])

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

  const button = (
    <button
      ref={buttonRef}
      type="button"
      data-variant="blue"
      disabled={pending}
      aria-expanded={popover || card ? confirming : undefined}
      aria-label={popover ? 'Hint' : undefined}
      title={popover ? 'Hint' : undefined}
      onClick={() => (confirming ? setConfirming(false) : confirmFirst ? setConfirming(true) : void hint())}
    >
      <BulbIcon />
      <span className={styles.toolLabel}>Hint</span>
    </button>
  )

  if (card) {
    return (
      <div className={styles.hintCard}>
        {button}
        {note}
        {confirming ? (
          <div ref={boxRef} className={styles.stakes} data-confirm role="group" aria-label="Hint">
            <p>
              <b>Use a hint?</b>
              This sticker won't be foil.
            </p>
            {confirmNote && <p>{confirmNote}</p>}
            <span>
              <button ref={confirmRef} type="button" data-variant="primary" data-size="compact" onClick={() => void hint()}>
                Use a hint
              </button>
              <button type="button" data-variant="paper" data-size="compact" onClick={() => setConfirming(false)}>
                Cancel
              </button>
            </span>
          </div>
        ) : (
          stakes
        )}
      </div>
    )
  }

  const confirm = confirming && (
    <div ref={boxRef} className={popover ? `${styles.confirm} ${styles.hintPop}` : styles.confirm} role="group" aria-label="Hint">
      <span>Using a hint means this sticker won't be foil.</span>
      <button ref={confirmRef} type="button" data-variant="primary" onClick={() => void hint()}>
        Use a hint
      </button>
      <button type="button" data-variant="ghost" onClick={() => setConfirming(false)}>
        Cancel
      </button>
      {note && <span className={styles.note}>{note}</span>}
    </div>
  )

  if (popover) {
    return (
      <span ref={anchorRef} className={styles.hintAnchor}>
        {button}
        {confirm}
      </span>
    )
  }
  return confirm || button
}

/** What a hint says, for a tag beside its cell. */
export function cellHintText({ kind, index }: HintResponse, cells: readonly Cell[]): string {
  if (kind === 'reveal') return 'Hint: this cell is filled.'
  return `Hint: this cell shouldn't be ${cells[index] === 'marked' ? 'crossed out' : 'filled'}.`
}

function BulbIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18h6M10 22h4" />
      <path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.3h6c0-1 .4-1.8 1-2.3A7 7 0 0 0 12 2z" />
    </svg>
  )
}
