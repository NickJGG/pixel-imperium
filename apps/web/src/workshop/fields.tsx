/** The builder's in-place edits: text that opens a field when clicked, and a paper chip that opens a picker. */
import { type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import type { HexPaper } from '@pixel-imperium/protocol'
import { derivePaper } from '../album/paper.ts'
import { PaperField } from '../make/PublishSheet.tsx'
import { usePadContain } from '../pad/PadProvider.tsx'
import appStyles from '../App.module.css'
import styles from './Builder.module.css'

/**
 * `value` with a ✎, or `placeholder` faintly while it's blank; clicked, a field that saves on Enter or leaving it
 * and drops the edit on Escape.
 */
export function EditableText({
  value,
  placeholder,
  label,
  maxLength,
  multiline = false,
  onSave,
}: {
  value: string
  placeholder: string
  /** The field's name, e.g. "Province name". */
  label: string
  maxLength: number
  multiline?: boolean
  onSave: (value: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    return (
      <button type="button" className={styles.editable} title={`Edit ${label.toLowerCase()}`} onClick={() => setDraft(value)}>
        {value.trim() ? value : <span className={styles.placeholder}>{placeholder}</span>}
        <span className={styles.pencil} aria-hidden="true">
          ✎
        </span>
      </button>
    )
  }
  const done = () => {
    if (draft !== value) onSave(draft.trim())
    setDraft(null)
  }
  const field = {
    className: styles.editField,
    'aria-label': label,
    autoFocus: true,
    maxLength,
    value: draft,
    placeholder,
    onBlur: done,
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setDraft(null)
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        done()
      }
    },
  }
  return multiline ? (
    <textarea {...field} rows={2} onChange={e => setDraft(e.target.value)} />
  ) : (
    <input {...field} onChange={e => setDraft(e.target.value)} />
  )
}

/** A chip in the paper's tab, opening a sheet to pick it; `none` as for `PaperField`. */
export function PaperChip({
  paper,
  fallback,
  none,
  swatch = false,
  onChange,
}: {
  paper: HexPaper | null
  /** Shown while `paper` is unset. */
  fallback: string
  none: { label: string; note: string } | false
  /** Just a square of the paper's color, its label left to screen readers. */
  swatch?: boolean
  onChange: (paper: HexPaper | null) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const label = `Paper · ${paper ? 'picked' : fallback}`
  const chip = { '--chip': paper ? derivePaper(paper).tab : 'var(--tab)' } as CSSProperties
  return (
    <>
      {swatch ? (
        <button
          ref={triggerRef}
          type="button"
          className={styles.paperSwatch}
          style={chip}
          aria-label={label}
          title={label}
          onClick={() => setOpen(true)}
        />
      ) : (
        <button
          ref={triggerRef}
          type="button"
          data-variant="paper"
          data-size="compact"
          className={styles.paperChip}
          style={chip}
          onClick={() => setOpen(true)}
        >
          {label}
        </button>
      )}
      {open && (
        <Sheet title="Paper" restore={triggerRef} onClose={() => setOpen(false)}>
          <PaperField paper={paper} onChange={onChange} none={none} />
        </Sheet>
      )}
    </>
  )
}

/** A small modal card with a Done button. */
export function Sheet({
  title,
  restore,
  onClose,
  children,
}: {
  title: string
  restore?: RefObject<HTMLElement | null>
  onClose: () => void
  children: ReactNode
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => dialogRef.current?.showModal(), [])
  usePadContain(dialogRef, true, onClose, restore)
  return (
    <dialog
      ref={dialogRef}
      className={appStyles.dialog}
      aria-label={title}
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
    >
      <h2>{title}</h2>
      {children}
      <div className={appStyles.dialogActions}>
        <button type="button" data-variant="primary" onClick={onClose}>
          Done
        </button>
      </div>
    </dialog>
  )
}
