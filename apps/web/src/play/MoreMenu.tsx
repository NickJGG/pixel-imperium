import { type CSSProperties, type ReactNode, useEffect, useId, useRef, useState } from 'react'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

interface Props {
  store: PlayStore
  /** The province's paper, which the popover is cut from like the panel. */
  paper: CSSProperties
  children: ReactNode
}

/** The panel's leftovers behind ⋯ when there's no room for it. Escape, a click away or a board stroke closes it. */
export function MoreMenu({ store, paper, children }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      buttonRef.current?.focus()
    }
    const onDown = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    const unsubscribe = store.subscribe(() => store.strokeActive && setOpen(false))
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      unsubscribe()
    }
  }, [open, store])

  return (
    <div ref={rootRef} className={styles.more}>
      <button
        ref={buttonRef}
        type="button"
        aria-label="More"
        title="More"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
      </button>
      {open && (
        <div id={id} className={styles.morePop} style={paper}>
          {children}
        </div>
      )}
    </div>
  )
}
