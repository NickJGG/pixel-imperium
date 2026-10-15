/**
 * The open draft, saved to localStorage on every edit, with an in-memory undo history: one step per stroke,
 * operation or reorder. A stroke shows its progress with `strokeTo` and lands as one step on `endStroke`.
 *
 * A Workshop draft is local-first: the server gets it only at checkpoints (`flushDraft`), when the tab hides or
 * closes, the editor is left or another draft opened, before Playtest and Publish, and 30 s after the first edit it
 * hasn't had. The dev /make draft (no account) stays on this device.
 */
import { useSyncExternalStore } from 'react'
import type { HexPaper } from '@pixel-imperium/protocol'
import { MAX_COLORS } from '@pixel-imperium/nonogram'
import { fetchDraftPuzzle, putDraftPuzzle } from '../api.ts'
import { type Draft, blankDraft, slugify } from './draft.ts'

/** A draft as this device keeps it; the dev /make draft predates every field past the Draft's own. */
export interface StoredDraft {
  draft: Draft
  paper: HexPaper | null
  updatedAt: string
  /** Edited since the server last had it. */
  unsent: boolean
}

/** Whose draft and which: `userId` null is the dev /make draft, which never syncs. */
export interface DraftKey {
  userId: string | null
  id: string
}

export type SaveState = 'saved' | 'saving' | 'local'

const MAKE_KEY = 'pixel-imperium:make-draft'
const HISTORY = 200
const SEND_AFTER_MS = 30_000

const storageKey = ({ userId, id }: DraftKey) => (userId === null ? MAKE_KEY : `pixel-imperium:draft:${userId}:${id}`)

const isOpen = (k: DraftKey) => key !== null && storageKey(k) === storageKey(key)

/** Random, with a `-` so it never looks like a published id. */
export const newDraftId = () => `d-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`

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

/** This device's copy, `null` when it has none. */
export function localDraft(key: DraftKey): StoredDraft | null {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(storageKey(key)) ?? 'null')
    if (!isDraft(parsed)) return null
    const { paper, updatedAt, unsent, ...draft } = parsed as Draft & Partial<Omit<StoredDraft, 'draft'>>
    return {
      draft,
      paper: typeof paper === 'string' ? paper : null,
      updatedAt: typeof updatedAt === 'string' ? updatedAt : new Date(0).toISOString(),
      unsent: unsent === true,
    }
  } catch {
    return null
  }
}

function store(key: DraftKey, s: StoredDraft) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ ...s.draft, paper: s.paper, updatedAt: s.updatedAt, unsent: s.unsent }))
  } catch {}
}

/** Drops this device's copy, and closes it if open, so nothing more of it is sent. */
export function forgetDraft(k: DraftKey) {
  if (isOpen(k)) {
    if (timer !== null) clearTimeout(timer)
    timer = null
    key = null
  }
  try {
    localStorage.removeItem(storageKey(k))
  } catch {}
}

/** Keeps `draft` on this device as a new draft for the server to have next time it's open; returns its id. */
export function createDraft(userId: string, draft: Draft, paper: HexPaper | null): string {
  const id = newDraftId()
  store({ userId, id }, { draft, paper, updatedAt: new Date().toISOString(), unsent: true })
  return id
}

export const blankStored = (): StoredDraft => ({
  draft: blankDraft(),
  paper: null,
  updatedAt: new Date(0).toISOString(),
  unsent: false,
})

/** `null` until a draft opens. */
let key: DraftKey | null = null
let current: Draft = blankDraft()
let meta: Omit<StoredDraft, 'draft'> = { paper: null, updatedAt: new Date(0).toISOString(), unsent: false }
let past: Draft[] = []
let future: Draft[] = []
let strokeBase: Draft | null = null
let history = { canUndo: false, canRedo: false }
let saveState: SaveState = 'saved'
let timer: ReturnType<typeof setTimeout> | null = null
const listeners = new Set<() => void>()

function emit() {
  if (history.canUndo !== past.length > 0 || history.canRedo !== future.length > 0)
    history = { canUndo: past.length > 0, canRedo: future.length > 0 }
  for (const listener of listeners) listener()
}

function setSaveState(next: SaveState) {
  if (saveState === next) return
  saveState = next
  emit()
}

function record(before: Draft) {
  past = [...past.slice(1 - HISTORY), before]
  future = []
}

/** An edit landed: keep it here now, and see it reaches the server within SEND_AFTER_MS. */
function changed() {
  meta = { ...meta, updatedAt: new Date().toISOString(), unsent: true }
  if (!key) return
  store(key, { draft: current, ...meta })
  if (key.userId !== null) timer ??= setTimeout(() => void flushDraft(), SEND_AFTER_MS)
}

/**
 * Makes `s` the draft being edited, with a fresh history; the one it replaces is sent first. Reopening the open
 * draft keeps it as it stands, unless `s` is newer (edited on another device since). Notifies no one, so a page can
 * open its draft as it first renders.
 */
export function openDraft(next: DraftKey, s: StoredDraft) {
  const reopened = isOpen(next)
  if (reopened && Date.parse(s.updatedAt) <= Date.parse(meta.updatedAt)) return
  if (timer !== null) clearTimeout(timer)
  timer = null
  const previous = key
  const left: StoredDraft = { draft: current, ...meta }
  key = next
  current = s.draft
  meta = { paper: s.paper, updatedAt: s.updatedAt, unsent: s.unsent }
  past = []
  future = []
  strokeBase = null
  history = { canUndo: false, canRedo: false }
  saveState = 'saved'
  if (!reopened && previous?.userId != null && left.unsent) void send(previous, left, true)
  if (s.unsent) {
    store(next, s)
    if (next.userId !== null) timer = setTimeout(() => void flushDraft(), 0)
  }
}

/** Sends the open draft if the server hasn't got it; `false` if it couldn't. */
export async function flushDraft({ keepalive = false } = {}): Promise<boolean> {
  if (timer !== null) clearTimeout(timer)
  timer = null
  if (key?.userId == null || !meta.unsent) return true
  return send(key, { draft: current, ...meta }, keepalive)
}

/** Only the open draft's sends show in its save state. */
async function send(sent: DraftKey, s: StoredDraft, keepalive: boolean): Promise<boolean> {
  const { title, width, height, cells, colors } = s.draft
  if (isOpen(sent)) setSaveState('saving')
  try {
    await putDraftPuzzle(sent.id, { title, width, height, cells, colors, paper: s.paper, updatedAt: s.updatedAt }, keepalive)
  } catch {
    if (isOpen(sent)) setSaveState('local')
    return false
  }
  if (isOpen(sent)) {
    // Edited again while the request was out: that newer copy still has to go.
    if (meta.updatedAt === s.updatedAt) {
      meta = { ...meta, unsent: false }
      store(sent, { draft: current, ...meta })
    }
    setSaveState('saved')
  } else {
    const there = localDraft(sent)
    if (there?.updatedAt === s.updatedAt) store(sent, { ...there, unsent: false })
  }
  return true
}

export const getDraft = (): Draft => current

export const getPaper = (): HexPaper | null => meta.paper

export const getDraftKey = (): DraftKey | null => key

export function subscribeDraft(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const useDraft = (): Draft => useSyncExternalStore(subscribeDraft, getDraft)

export const useHistory = () => useSyncExternalStore(subscribeDraft, () => history)

export const useSaveState = (): SaveState => useSyncExternalStore(subscribeDraft, () => saveState)

/** One undoable step. */
export function commit(next: Draft) {
  if (next === current) return
  record(current)
  current = next
  changed()
  emit()
}

/** The paper picked at Publish; not a step of its own. */
export function setPaper(paper: HexPaper | null) {
  if (paper === meta.paper) return
  meta = { ...meta, paper }
  changed()
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
    changed()
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
  changed()
  emit()
}

export function redo() {
  const after = future.at(-1)
  if (!after || strokeBase) return
  future = future.slice(0, -1)
  past = [...past, current]
  current = after
  changed()
  emit()
}

/** The copy to open: the server's when it's newer than this device's (edited on another device), else this device's. */
export async function openingCopy(key: DraftKey): Promise<StoredDraft> {
  const local = localDraft(key)
  const server = await fetchDraftPuzzle(key.id).catch(() => null)
  if (!server || (local && Date.parse(local.updatedAt) >= Date.parse(server.updatedAt))) return local ?? blankStored()
  const { title, width, height, cells, colors, paper, updatedAt } = server
  return { draft: { id: slugify(title), title, width, height, cells, colors }, paper, updatedAt, unsent: false }
}
