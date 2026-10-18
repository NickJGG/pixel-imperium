/**
 * The Friends list and its requests as `GET /api/me/friends` has them, with each friend's presence kept live from the
 * party socket. Fetched while something shows it (`useFriends`), again whenever the socket's friends or requests
 * change, and after each of this player's own changes, which also show at once.
 */
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { FriendRequestOutcome, Friends } from '@pixel-imperium/protocol'
import {
  acceptFriendRequest,
  cancelFriendRequest,
  declineFriendRequest,
  fetchFriends,
  removeFriend,
  sendFriendRequest,
} from '../api.ts'
import { getAccount, useAccount } from '../account.ts'
import { party, usePartyView } from '../party/party-store.ts'
import { withPresence } from './presence.ts'

interface Held {
  userId: string
  friends: Friends
}

let held: Held | null = null
let fetching: Promise<void> | null = null
let again = false
const listeners = new Set<() => void>()

function hold(next: Held | null): void {
  held = next
  for (const listener of listeners) listener()
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

export function refreshFriends(): Promise<void> {
  if (fetching) {
    again = true
    return fetching
  }
  const userId = getAccount().account?.userId
  if (!userId) return Promise.resolve()
  fetching = fetchFriends()
    .then(
      friends => {
        if (getAccount().account?.userId === userId) hold({ userId, friends })
      },
      () => {},
    )
    .finally(() => {
      fetching = null
      if (again) {
        again = false
        void refreshFriends()
      }
    })
  return fetching
}

/** Applies a change to the list at once, ahead of the server's answer. */
function edit(change: (friends: Friends) => Friends): void {
  if (held) hold({ ...held, friends: change(held.friends) })
}

const without = <T extends { handle: string }>(list: readonly T[], handle: string) => list.filter(p => !same(p.handle, handle))

/** This player's Friends and requests, `null` signed out or until the first fetch lands. */
export function useFriends(): Friends | null {
  const { account } = useAccount()
  const view = usePartyView()
  const current = useSyncExternalStore(subscribe, () => held)
  const key = `${view.friends.map(f => f.handle).join()}|${view.friendRequests.join()}`
  useEffect(() => {
    if (account) void refreshFriends()
  }, [account?.userId, key])
  const mine = current && current.userId === account?.userId ? current.friends : null
  return useMemo(() => mine && { ...mine, friends: withPresence(mine.friends, view.friends) }, [mine, view.friends])
}

async function settle(call: Promise<void>): Promise<boolean> {
  const ok = await call.then(
    () => true,
    () => false,
  )
  await refreshFriends()
  return ok
}

/** Rejects only when the server gives no outcome, as on a rate limit. */
export async function addFriend(handle: string): Promise<FriendRequestOutcome> {
  const outcome = await sendFriendRequest(handle)
  if (outcome === 'accepted') party.answeredFriendRequest(handle)
  await refreshFriends()
  return outcome
}

export function acceptFriend(handle: string): Promise<boolean> {
  party.answeredFriendRequest(handle)
  edit(f => ({ ...f, incoming: without(f.incoming, handle) }))
  return settle(acceptFriendRequest(handle))
}

export function declineFriend(handle: string): Promise<boolean> {
  party.answeredFriendRequest(handle)
  edit(f => ({ ...f, incoming: without(f.incoming, handle) }))
  return settle(declineFriendRequest(handle))
}

export function cancelFriend(handle: string): Promise<boolean> {
  edit(f => ({ ...f, outgoing: without(f.outgoing, handle) }))
  return settle(cancelFriendRequest(handle))
}

export function unfriend(handle: string): Promise<boolean> {
  edit(f => ({ ...f, friends: without(f.friends, handle) }))
  return settle(removeFriend(handle))
}
