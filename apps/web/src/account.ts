/**
 * The active player: signed out, or an account whose progress is cached locally and synced.
 * On load with a session, the cache is refreshed from the server before routes render
 * (`accountReady`); offline, the last signed-in account keeps playing from its cache.
 */
import { useSyncExternalStore } from 'react'
import type { Assists, ImportItem } from '@pixel-imperium/protocol'
import { fetchMyProgress, importProgress, putProgress, putSettings, submitSolve } from './api.ts'
import { getSession, signOut } from './auth.ts'
import { ProgressStorage, signedOutStorage } from './play/progress-storage.ts'
import { assistsOf, getSettings, subscribeSettings, updateSettings } from './settings.ts'
import { ProgressSync } from './sync.ts'

interface Account {
  userId: string
  handle: string
}

export interface ImportOffer {
  handle: string
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
}

let state: AccountState = { account: null, storage: signedOutStorage, sync: null, generation: 0, importOffer: null }
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

let stopListening = () => {}

function listen(sync: ProgressSync): void {
  const leave = () => void sync.flush({ keepalive: true })
  const onVisibility = () => document.visibilityState === 'hidden' && leave()
  const onOnline = () => {
    void sync.reconnect()
    pushAssistsIfChanged()
  }
  window.addEventListener('pagehide', leave)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  const unsubscribeSettings = subscribeSettings(pushAssistsIfChanged)
  stopListening = () => {
    window.removeEventListener('pagehide', leave)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    unsubscribeSettings()
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
    setState({ importOffer: { handle: account.handle, ...counts } })
  }
}

export const accountReady: Promise<void> = start()

/** Moves signed-out play into the account (the server decides what counts), then clears it from the device. */
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

/** Sends any unsynced play first; the account's cache stays on the device for its next sign-in. */
export async function signOutAccount(): Promise<void> {
  await state.sync?.flush()
  stopListening()
  await signOut()
  cacheAccount(null)
  sessionId = null
  syncedAssists = ''
  setState({ account: null, storage: signedOutStorage, sync: null, importOffer: null, generation: state.generation + 1 })
}
