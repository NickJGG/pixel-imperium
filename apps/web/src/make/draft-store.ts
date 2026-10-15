/**
 * The /make draft, kept in localStorage on this device, with an in-memory undo history: one step per stroke,
 * operation or reorder. A stroke shows its progress with `strokeTo` and lands as one step on `endStroke`.
 */
import { useSyncExternalStore } from 'react'
import { type Draft, MAX_COLORS, blankDraft } from './draft.ts'

const KEY = 'pixel-imperium:make-draft'
const HISTORY = 200

function isDraft(value: unknown): value is Draft {
  if (!value || typeof value !== 'object') return false
  const d = value as Record<string, unknown>
  return (
    typeof d.id === 'string' &&
    typeof d.title === 'string' &&
    Number.isInteger(d.width) &&
    Number.isInteger(d.height) &&
    Array.isArray(d.colors) &&
    d.colors.length <= MAX_COLORS &&
    d.colors.every(c => typeof c === 'string') &&
    Array.isArray(d.cells) &&
    d.cells.length === (d.width as number) * (d.height as number) &&
    d.cells.every(c => c === null || (d.colors as string[]).includes(c))
  )
}

function load(): Draft {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (isDraft(parsed)) return parsed
  } catch {}
  return blankDraft()
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {}
}

let current = load()
let past: Draft[] = []
let future: Draft[] = []
let strokeBase: Draft | null = null
let history = { canUndo: false, canRedo: false }
const listeners = new Set<() => void>()

function emit() {
  if (history.canUndo !== past.length > 0 || history.canRedo !== future.length > 0)
    history = { canUndo: past.length > 0, canRedo: future.length > 0 }
  for (const listener of listeners) listener()
}

function record(before: Draft) {
  past = [...past.slice(1 - HISTORY), before]
  future = []
}

export const getDraft = (): Draft => current

export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useDraft = (): Draft => useSyncExternalStore(subscribeDraft, getDraft)

export const useHistory = () => useSyncExternalStore(subscribeDraft, () => history)

/** One undoable step. */
export function commit(next: Draft) {
  if (next === current) return
  record(current)
  current = next
  save()
  emit()
}

export function beginStroke() {
  strokeBase = current
}

/** The stroke so far; not a step of its own. */
export function strokeTo(next: Draft) {
  if (strokeBase === null || next === current) return
  current = next
  emit()
}

/** The Draft as it stood when the stroke began, which line and rectangle redraw onto. */
export const strokeStart = (): Draft | null => strokeBase

export function endStroke() {
  if (strokeBase === null) return
  if (strokeBase !== current) {
    record(strokeBase)
    save()
  }
  strokeBase = null
  emit()
}

export function undo() {
  const before = past.at(-1)
  if (!before || strokeBase) return
  past = past.slice(0, -1)
  future = [...future, current]
  current = before
  save()
  emit()
}

export function redo() {
  const after = future.at(-1)
  if (!after || strokeBase) return
  future = future.slice(0, -1)
  past = [...past, current]
  current = after
  save()
  emit()
}
