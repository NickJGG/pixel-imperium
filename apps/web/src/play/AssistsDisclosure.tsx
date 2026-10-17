import { type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { usePadContain } from '../pad/PadProvider.tsx'
import { useSettings } from '../settings.ts'
import { assists } from './AssistChips.tsx'
import { AssistSwitches } from './AssistSwitches.tsx'
import { ControlsLegend } from './ControlsLegend.tsx'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

/** The rail's Assists, folded into a button for a rail too short to list them. */
export function AssistsDisclosure({ store }: { store: PlayStore }) {
  const settings = useSettings()
  const on = assists.filter(({ key }) => settings[key]).length
  return (
    <RailDisclosure store={store} label={`Assists · ${on}`} icon={<SlidersIcon />}>
      <AssistSwitches />
    </RailDisclosure>
  )
}

/** The rail's Controls legend, folded into a button for a rail too short to list it. */
export function ControlsDisclosure({ store }: { store: PlayStore }) {
  return (
    <RailDisclosure store={store} label="Controls" icon={<KeysIcon />}>
      <ControlsLegend />
    </RailDisclosure>
  )
}

/**
 * A folded rail section: a button opening `children` below it, or above when the window runs out. Escape, a
 * click away or a board stroke closes it.
 */
function RailDisclosure({
  store,
  label,
  icon,
  children,
}: {
  store: PlayStore
  label: string
  icon: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const id = useId()
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
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
      >
        {icon}
        {label}
        <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div ref={popRef} id={id} className={styles.assistsPop} data-up={up || undefined}>
          {children}
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
      e.preventDefault()
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

function KeysIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" />
    </svg>
  )
}
