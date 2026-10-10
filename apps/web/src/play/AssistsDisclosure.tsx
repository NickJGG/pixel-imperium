import { type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { PadGlyph } from '../pad/PadGlyph.tsx'
import { usePadContain } from '../pad/PadProvider.tsx'
import { useSettings } from '../settings.ts'
import { assists } from './AssistChips.tsx'
import { AssistSwitches } from './AssistSwitches.tsx'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

/** The rail's Assists row, opening the switches below it, or above when the window runs out. Escape, a click away or a board stroke closes it. */
export function AssistsDisclosure({ store }: { store: PlayStore }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const settings = useSettings()
  const on = assists.filter(({ key }) => settings[key]).length
  usePadContain(popRef, open, () => setOpen(false), buttonRef)
  useDismiss(open, setOpen, store, rootRef, buttonRef)

  const [up, setUp] = useState(false)
  useLayoutEffect(() => {
    const pop = popRef.current
    if (!open || !pop) return setUp(false)
    setUp(pop.getBoundingClientRect().bottom > innerHeight - 8)
  }, [open])

  return (
    <div ref={rootRef} className={styles.disclosure}>
      <button
        ref={buttonRef}
        type="button"
        data-pad-menu
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
      >
        <SlidersIcon />
        Assists
        <small>{on} on</small>
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
        <PadGlyph button="Menu" corner />
      </button>
      {open && (
        <div ref={popRef} id={id} className={styles.assistsPop} data-up={up || undefined}>
          <AssistSwitches />
        </div>
      )}
    </div>
  )
}

/** Closes a popover on Escape (back to `button`), a pointerdown outside `root`, or a board stroke. */
export function useDismiss(
  open: boolean,
  setOpen: (open: boolean) => void,
  store: PlayStore,
  root: RefObject<HTMLElement | null>,
  button: RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      button.current?.focus()
    }
    const onDown = (e: PointerEvent) => !root.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    const unsubscribe = store.subscribe(() => store.strokeActive && setOpen(false))
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
      unsubscribe()
    }
  }, [open, setOpen, store, root, button])
}

export function SlidersIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12" />
      <circle cx="16" cy="6" r="2" />
      <circle cx="10" cy="12" r="2" />
      <circle cx="18" cy="18" r="2" />
    </svg>
  )
}
