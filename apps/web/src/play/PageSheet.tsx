import { type CSSProperties, type ReactNode, useId, useRef, useState } from 'react'
import { usePadContain } from '../pad/PadProvider.tsx'
import { SlidersIcon, useDismiss } from './AssistsDisclosure.tsx'
import type { PlayStore } from './store.ts'
import styles from './Play.module.css'

interface Props {
  store: PlayStore
  /** Gives way to the after sheet. */
  solved: boolean
  /** The province's paper, which the sheet is cut from like the rail. */
  paper: CSSProperties
  children: ReactNode
}

/** The dock's sliders button and the page sheet it raises over the dock: the rail's contents where there's no rail. */
export function PageSheet({ store, solved, paper, children }: Props) {
  const [open, setOpen] = useState(false)
  if (open && solved) setOpen(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const id = useId()
  usePadContain(sheetRef, open, () => setOpen(false), buttonRef)
  useDismiss(open, setOpen, store, rootRef, buttonRef)

  return (
    <div ref={rootRef} className={styles.sheetRoot} data-pad-panel>
      <button
        ref={buttonRef}
        type="button"
        className={styles.sheetButton}
        data-variant="flat"
        data-size="compact"
        aria-label="Page and assists"
        title="Page and assists"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
      >
        <SlidersIcon />
      </button>
      {open && (
        <div ref={sheetRef} id={id} className={`${styles.sheet} ${styles.sheetFace}`} style={paper}>
          {children}
        </div>
      )}
    </div>
  )
}
