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
  onEnter,
}: {
  value: string
  placeholder: string
  /** The field's name, e.g. "Province name". */
  label: string
  maxLength: number
  multiline?: boolean
  onSave: (value: string) => void
  /** After saving on Enter, as distinct from leaving the field. */
  onEnter?: (value: string) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  if (draft === null) {
    // Not a <button>: one is always an inline-block, so a wrapped title's box would stand as wide as its column and
    // whatever follows it (a paper swatch) couldn't sit just after the ✎.
    return (
      <span
        role="button"
        tabIndex={0}
        className={styles.editable}
        title={`Edit ${label.toLowerCase()}`}
        onClick={() => setDraft(value)}
        onKeyDown={e => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          setDraft(value)
        }}
      >
        {value.trim() ? value : <span className={styles.placeholder}>{placeholder}</span>}
        <span className={styles.pencil} aria-hidden="true">
          ✎
        </span>
      </span>
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
        onEnter?.(draft.trim())
      }
    },
  }
  return multiline ? (
    <textarea {...field} rows={2} onChange={e => setDraft(e.target.value)} />
  ) : (
    <input {...field} onChange={e => setDraft(e.target.value)} />
  )
}

/**
 * A square of the paper's color, its label left to screen readers, opening a sheet to pick it; `none` as for
 * `PaperField`. Unset where a pick is required, it's hatched and edged red.
 */
export function PaperChip({
  paper,
  fallback,
  none,
  onChange,
}: {
  paper: HexPaper | null
  /** Shown while `paper` is unset. */
  fallback: string
  none: { label: string; note: string } | false
  onChange: (paper: HexPaper | null) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const label = `Paper · ${paper ? 'picked' : fallback}`
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.paperSwatch}
        style={{ '--chip': paper ? derivePaper(paper).tab : 'var(--tab)' } as CSSProperties}
        data-unset={(!paper && none === false) || undefined}
        aria-label={label}
        title={label}
        onClick={() => setOpen(true)}
      />
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
