/**
 * The active player: signed out, or an account whose progress is cached locally and synced.
 * On load with a session, the cache is refreshed from the server before routes render
 * (`accountReady`); offline, the last signed-in account keeps playing from its cache.
 */
import { useSyncExternalStore } from 'react'
import type { Assists, HandleProblem, ImportItem } from '@pixel-imperium/protocol'
import {
  fetchMyProgress,
  importProgress,
  putHandle,
  putLessonDone,
  putProgress,
  putSettings,
  putTutorialAsked,
  submitSolve,
} from './api.ts'
import { deleteUser, getSession, refreshSession, signOut } from './auth.ts'
import { ProgressStorage, signedOutStorage } from './play/progress-storage.ts'
import { assistsOf, getSettings, subscribeSettings, updateSettings } from './settings.ts'
import { ProgressSync } from './sync.ts'
import { getAskedAt, recordAsked, subscribeAsked } from './tutorial/asked.ts'
import { getDone, recordDone, subscribeDone } from './tutorial/done.ts'

interface Account {
  userId: string
  handle: string
}

export interface ImportOffer {
  solved: number
  inProgress: number
}

export interface AccountState {
  account: Account | null
  storage: ProgressStorage
  sync: ProgressSync | null
  /** Bumped whenever the cache is replaced, so live play remounts from it. */
  generation: number
  importOffer: ImportOffer | null
  /** The account still has the provisional handle it got at sign-up and should pick its own. */
  needsHandle: boolean
}

const SIGNED_OUT = { account: null, storage: signedOutStorage, sync: null, importOffer: null, needsHandle: false }
let state: AccountState = { ...SIGNED_OUT, generation: 0 }
const listeners = new Set<() => void>()

function setState(patch: Partial<AccountState>): void {
  state = { ...state, ...patch }
  for (const listener of listeners) listener()
}

export const getAccount = (): AccountState => state

export function useAccount(): AccountState {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    getAccount,
  )
}

const ACCOUNT_KEY = 'pixel-imperium:account'

function cachedAccount(): Account | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(ACCOUNT_KEY) ?? 'null') as Partial<Account> | null
    return typeof parsed?.userId === 'string' && typeof parsed.handle === 'string'
      ? { userId: parsed.userId, handle: parsed.handle }
      : null
  } catch {
    return null
  }
}

function cacheAccount(account: Account | null): void {
  try {
    if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
    else localStorage.removeItem(ACCOUNT_KEY)
  } catch {}
}

const assistsKey = (assists: Assists) => JSON.stringify(assistsOf({ ...getSettings(), ...assists }))
/** The assists the server is known to hold, as `assistsKey`; `''` when unknown. */
let syncedAssists = ''

function pushAssists(): void {
  const assists = assistsOf(getSettings())
  syncedAssists = assistsKey(assists)
  putSettings(assists).catch(() => (syncedAssists = ''))
}

function pushAssistsIfChanged(): void {
  if (state.account && assistsKey(assistsOf(getSettings())) !== syncedAssists) pushAssists()
}

/** Whether the server is known to have the Tutorial as asked. */
let syncedAsked = false

function pushAskedIfNeeded(): void {
  if (!state.account || syncedAsked || !getAskedAt()) return
  syncedAsked = true
  putTutorialAsked().catch(() => (syncedAsked = false))
}

/** The finished Lessons the server is known to have. */
let syncedDone = new Set<string>()

function pushDoneIfNeeded(): void {
  if (!state.account) return
  for (const key of getDone()) {
    if (syncedDone.has(key)) continue
    syncedDone.add(key)
    putLessonDone(key).catch(() => syncedDone.delete(key))
  }
}

let stopListening = () => {}

function listen(sync: ProgressSync): void {
  const leave = () => void sync.flush({ keepalive: true })
  const onVisibility = () => document.visibilityState === 'hidden' && leave()
  const onOnline = () => {
    void sync.reconnect()
    pushAssistsIfChanged()
    pushAskedIfNeeded()
    pushDoneIfNeeded()
  }
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  const unsubscribeSettings = subscribeSettings(pushAssistsIfChanged)
  const unsubscribeAsked = subscribeAsked(pushAskedIfNeeded)
  const unsubscribeDone = subscribeDone(pushDoneIfNeeded)
  stopListening = () => {
    window.removeEventListener('pagehide', leave)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    unsubscribeSettings()
    unsubscribeAsked()
    unsubscribeDone()
    sync.dispose()
  }
}

/** Replaces the cache from the server; `false` when offline. */
async function refresh(sync: ProgressSync): Promise<boolean> {
  const data = await sync.pull()
  if (!data) return false
  if (data.assists) {
    syncedAssists = assistsKey(data.assists)
    updateSettings(data.assists)
  } else {
    pushAssists()
  }
  if (data.tutorialAskedAt) {
    syncedAsked = true
    recordAsked(data.tutorialAskedAt)
  } else {
    syncedAsked = false
    pushAskedIfNeeded()
  }
  syncedDone = new Set(data.lessonsDone)
  recordDone(data.lessonsDone)
  pushDoneIfNeeded()
  setState({ generation: state.generation + 1 })
  return true
}

function signedOutCounts(): { solved: number; inProgress: number } {
  let solved = 0
  let inProgress = 0
  for (const id of signedOutStorage.puzzleIds()) {
    if (signedOutStorage.loadSolved(id)) solved++
    else if (signedOutStorage.loadCells(id)?.includes('#')) inProgress++
  }
  return { solved, inProgress }
}

let sessionId: string | null = null

async function start(): Promise<void> {
  const { data, error } = await getSession().catch(() => ({ data: null, error: true }))
  let account: Account | null
  if (error) {
    account = cachedAccount()
  } else {
    account = data && { userId: data.user.id, handle: data.user.handle }
    sessionId = data?.session.id ?? null
    setState({ needsHandle: data ? !data.user.handleConfirmed : false })
    cacheAccount(account)
  }
  if (!account) return

  const storage = new ProgressStorage(account.userId)
  const sync = new ProgressSync(storage, { fetchProgress: fetchMyProgress, putProgress, solve: submitSolve })
  setState({ account, storage, sync })
  listen(sync)
  if (!sessionId || !(await refresh(sync))) return

  const counts = signedOutCounts()
  if (counts.solved + counts.inProgress > 0 && storage.loadMeta('import-deferred') !== sessionId) {
    setState({ importOffer: counts })
  }
}

export const accountReady: Promise<void> = start()

/**
 * Moves signed-out play into the account (the server decides what counts, and never makes it foil),
 * then clears it from the device.
 */
export async function acceptImport(): Promise<void> {
  const { sync } = state
  if (!sync) return
  const puzzles = signedOutStorage.puzzleIds().map((id): ImportItem => {
    const cells = signedOutStorage.loadCells(id)
    return {
      id,
      solved: signedOutStorage.loadSolved(id) !== null,
      replaying: signedOutStorage.loadReplay(id),
      ...(cells !== null && { cells }),
      ...(signedOutStorage.loadHinted(id) && { hinted: true }),
    }
  })
  await importProgress({ puzzles })
  signedOutStorage.clear()
  setState({ importOffer: null })
  await refresh(sync)
}

/** Keeps signed-out play on the device and asks again at the next sign-in. */
export function deferImport(): void {
  if (sessionId) state.storage.saveMeta('import-deferred', sessionId)
  setState({ importOffer: null })
}

export function discardImport(): void {
  signedOutStorage.clear()
  setState({ importOffer: null })
}

/** Sets and confirms the account's handle; resolves to why the server refused it, if it did. */
export async function saveHandle(handle: string): Promise<HandleProblem | null> {
  const result = await putHandle(handle)
  if ('reason' in result) return result.reason
  const account = state.account && { ...state.account, handle: result.handle }
  cacheAccount(account)
  setState({ account, needsHandle: false })
  refreshSession()
  return null
}

function reset(): void {
  stopListening()
  cacheAccount(null)
  sessionId = null
  syncedAssists = ''
  syncedAsked = false
  syncedDone = new Set()
  setState({ ...SIGNED_OUT, generation: state.generation + 1 })
}

/**
 * Deletes the account on the server, then everything it left on this device.
 * `'reauthenticate'` when the session is too old to authorize it; signing in again refreshes it.
 */
export async function deleteAccount(): Promise<'deleted' | 'reauthenticate'> {
  const { error } = await deleteUser()
  if (error?.code === 'SESSION_EXPIRED') return 'reauthenticate'
  if (error) throw new Error(error.message ?? error.statusText)
  state.storage.forget()
  reset()
  return 'deleted'
}

/** Sends any unsynced play first; the account's cache stays on the device for its next sign-in. */
export async function signOutAccount(): Promise<void> {
  await state.sync?.flush()
  await signOut()
  reset()
}
