/**
 * The tab's one `PartySession`. Signed in it connects as the page loads; signed out only once this device holds a
 * seat it joined by link, remembered across loads so a guest's tabs come back to it. The account changing reconnects
 * it as the new player. The router tells it which puzzle page the tab is on, and carries out the Host's moves.
 */
import { useSyncExternalStore } from 'react'
import type { AnyRouter } from '@tanstack/react-router'
import { accountReady, getAccount, subscribeAccount } from '../account.ts'
import { playIdOf } from '../campaign/worlds/transitions.ts'
import { deviceToken } from './device.ts'
import { type PartyView, PartySession } from './session.ts'

const GUEST_KEY = 'pixel-imperium:party-guest'

let navigate: (puzzleId: string) => void = () => {}

export const party = new PartySession({ deviceToken: deviceToken(), onMove: id => navigate(id) })

export const usePartyView = (): PartyView => useSyncExternalStore(party.subscribe, party.getState)

function guestSeated(): boolean {
  try {
    return localStorage.getItem(GUEST_KEY) !== null
  } catch {
    return false
  }
}

function setGuestSeated(seated: boolean): void {
  if (seated === guestSeated()) return
  try {
    if (seated) localStorage.setItem(GUEST_KEY, '1')
    else localStorage.removeItem(GUEST_KEY)
  } catch {}
}

/** By link: connects first if this signed-out device isn't yet. */
export function joinParty(code: string, started: boolean): void {
  party.start()
  party.join(code, started)
}

export function installParty(router: AnyRouter): void {
  navigate = id => void router.navigate({ to: '/play/$id', params: { id } })
  party.setHere(playIdOf(router.state.location.pathname) ?? null)
  router.subscribe('onResolved', ({ toLocation }) => party.setHere(playIdOf(toLocation.pathname) ?? null))

  party.subscribe(() => {
    if (getAccount().account) return
    const { status, party: current } = party.getState()
    if (current) setGuestSeated(true)
    else if (status === 'live') setGuestSeated(false)
  })

  let userId: string | null | undefined
  const follow = () => {
    const id = getAccount().account?.userId ?? null
    if (id === userId) return
    if (userId !== undefined) party.stop()
    userId = id
    if (id !== null || guestSeated()) party.start()
  }
  void accountReady.then(() => {
    follow()
    subscribeAccount(follow)
  })
}

let offer: string | null = null
const offerListeners = new Set<() => void>()

function setOffer(id: string | null): void {
  offer = id
  for (const listener of offerListeners) listener()
}

/** Marks the page's puzzle as one the Party may play, for the menu's own Play with party; returns the unmarking. */
export function offerPlay(puzzleId: string): () => void {
  setOffer(puzzleId)
  return () => {
    if (offer === puzzleId) setOffer(null)
  }
}

export const usePlayOffer = (): string | null =>
  useSyncExternalStore(
    listener => {
      offerListeners.add(listener)
      return () => offerListeners.delete(listener)
    },
    () => offer,
  )
