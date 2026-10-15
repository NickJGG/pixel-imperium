/**
 * The open draft campaign, local-first like a draft puzzle (draft-store.ts): every edit lands in localStorage at
 * once, and the server gets it at checkpoints, when the tab hides or closes, a builder page is left, before Playtest
 * and Publish, and 30 s after an edit it hasn't had. A change to which puzzles go where goes within a second instead,
 * since the tier preview and the checks come back with each send. The draft puzzles it holds that only this device
 * has go first, so the server can check them.
 */
import { useSyncExternalStore } from 'react'
import type { CampaignPreview, DraftCampaignDoc } from '@pixel-imperium/protocol'
import { fetchDraftCampaign, putDraftCampaign } from '../api.ts'
import { forgetWorkshop } from '../content.ts'
import { type SaveState, sendDraft } from '../make/draft-store.ts'

export interface StoredCampaign {
  doc: DraftCampaignDoc
  updatedAt: string
  /** Edited since the server last had it. */
  unsent: boolean
  /** The server's check of the doc it last had; `null` before it's had one. */
  preview: CampaignPreview | null
}

export interface CampaignKey {
  userId: string
  id: string
}

const SEND_AFTER_MS = 30_000
const SEND_SOON_MS = 800

const storageKey = ({ userId, id }: CampaignKey) => `pixel-imperium:campaign:${userId}:${id}`

/** This device's copy, `null` when it has none. */
export function localCampaign(key: CampaignKey): StoredCampaign | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey(key)) ?? 'null') as Partial<StoredCampaign> | null
    if (!parsed?.doc || !Array.isArray(parsed.doc.provinces) || typeof parsed.updatedAt !== 'string') return null
    return { doc: parsed.doc, updatedAt: parsed.updatedAt, unsent: parsed.unsent === true, preview: parsed.preview ?? null }
  } catch {
    return null
  }
}

function store(key: CampaignKey, s: StoredCampaign) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(s))
  } catch {}
}

/** Drops this device's copy, and closes it if open. */
export function forgetCampaign(k: CampaignKey) {
  if (isOpen(k)) {
    clearTimer()
    key = null
  }
  try {
    localStorage.removeItem(storageKey(k))
  } catch {}
}

/** The copy to open: the server's when it's newer than this device's, else this device's; `null` if neither has it. */
export async function openingCampaign(key: CampaignKey): Promise<StoredCampaign | null> {
  const local = localCampaign(key)
  const server = await fetchDraftCampaign(key.id).catch(() => undefined)
  if (server === undefined) return local
  if (!server) return local?.unsent ? local : null
  if (local && Date.parse(local.updatedAt) >= Date.parse(server.updatedAt)) return { ...local, preview: local.preview ?? server.preview }
  return { doc: server.doc, updatedAt: server.updatedAt, unsent: false, preview: server.preview }
}

let key: CampaignKey | null = null
let current: StoredCampaign | null = null
let saveState: SaveState = 'saved'
let timer: ReturnType<typeof setTimeout> | null = null
let due = Infinity
const listeners = new Set<() => void>()

const isOpen = (k: CampaignKey) => key !== null && key.userId === k.userId && key.id === k.id

function emit() {
  for (const listener of listeners) listener()
}

function clearTimer() {
  if (timer !== null) clearTimeout(timer)
  timer = null
  due = Infinity
}

/** Sends within `ms`, unless a send is already due sooner. */
function sendWithin(ms: number) {
  const at = Date.now() + ms
  if (at >= due) return
  clearTimer()
  due = at
  timer = setTimeout(() => void flushCampaign(), ms)
}

/**
 * Makes `s` the draft campaign being built; the one it replaces is sent first. Reopening the open one keeps it as
 * it stands unless `s` is newer. Notifies no one, so a page can open it as it first renders.
 */
export function openCampaign(next: CampaignKey, s: StoredCampaign) {
  if (isOpen(next) && current && Date.parse(s.updatedAt) <= Date.parse(current.updatedAt)) return
  if (key && current?.unsent && !isOpen(next)) void send(key, current, true)
  clearTimer()
  key = next
  current = s
  saveState = 'saved'
  store(next, s)
  if (s.unsent) sendWithin(0)
}

export async function flushCampaign({ keepalive = false } = {}): Promise<boolean> {
  clearTimer()
  if (!key || !current?.unsent) return true
  return send(key, current, keepalive)
}

async function send(sent: CampaignKey, s: StoredCampaign, keepalive: boolean): Promise<boolean> {
  if (isOpen(sent)) setSaveState('saving')
  try {
    const refs = s.doc.provinces.flatMap(p => p.puzzleIds)
    await Promise.all(refs.map(id => sendDraft({ userId: sent.userId, id })))
    const res = await putDraftCampaign(sent.id, { doc: s.doc, updatedAt: s.updatedAt }, keepalive)
    // Another device sent a newer copy: it wins, as on opening.
    const adopted = res.applied ? null : await fetchDraftCampaign(sent.id).catch(() => null)
    forgetWorkshop()
    if (!isOpen(sent) || !current) return true
    if (adopted) current = { doc: adopted.doc, updatedAt: adopted.updatedAt, unsent: false, preview: adopted.preview }
    // Edited again while the request was out: that newer copy still has to go, and keeps the older preview meanwhile.
    else current = { ...current, preview: res.preview, unsent: current.updatedAt !== s.updatedAt }
    store(sent, current)
    setSaveState('saved')
    return true
  } catch {
    if (isOpen(sent)) setSaveState('local')
    return false
  }
}

function setSaveState(next: SaveState) {
  saveState = next
  emit()
}

/** Applies `edit` to the open doc; `soon` for one that moves puzzles, whose preview is worth having back quickly. */
export function editCampaign(edit: (doc: DraftCampaignDoc) => DraftCampaignDoc, { soon = false } = {}) {
  if (!key || !current) return
  const doc = edit(current.doc)
  if (doc === current.doc) return
  current = { ...current, doc, updatedAt: new Date().toISOString(), unsent: true }
  store(key, current)
  sendWithin(soon ? SEND_SOON_MS : SEND_AFTER_MS)
  emit()
}

/** Takes the preview a refused publish came back with. */
export function setPreview(preview: CampaignPreview) {
  if (!key || !current) return
  current = { ...current, preview }
  store(key, current)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const getCurrent = () => current

/** The open draft campaign; `null` before one opens. */
export const useCampaign = (): StoredCampaign | null => useSyncExternalStore(subscribe, getCurrent)

export const useCampaignSave = (): SaveState => useSyncExternalStore(subscribe, () => saveState)

/** Sends the open campaign when the tab hides or closes, and as the calling page goes. */
export function flushOnLeave(): () => void {
  const leave = () => void flushCampaign({ keepalive: true })
  const onVisibility = () => document.visibilityState === 'hidden' && leave()
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', onVisibility)
  return () => {
    window.removeEventListener('pagehide', leave)
    document.removeEventListener('visibilitychange', onVisibility)
    leave()
  }
}
