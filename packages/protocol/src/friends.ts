/** Friends: mutual, between two Accounts, made by a request the other side accepts. */

/** Another Account as the Friends list shows it. */
export interface FriendPerson {
  handle: string
  name: string
  image: string | null
}

/** Whether a friend has a tab open, and how many seats their Party has taken, if they're in one. */
export interface FriendPresence {
  handle: string
  online: boolean
  party: number | null
}

export type Friend = FriendPerson & FriendPresence

/** `GET /api/me/friends`. */
export interface Friends {
  /** Online first, then by Handle. */
  friends: Friend[]
  /** Requests waiting on this player, newest first. */
  incoming: FriendPerson[]
  /** Requests this player sent that are still waiting, newest first. */
  outgoing: FriendPerson[]
}

/** `POST /api/me/friends/requests`. */
export interface FriendRequestBody {
  handle: string
}

/**
 * `accepted` when they had already asked this player, which makes them friends at once; `already` when they are
 * friends or this player already asked them.
 */
export type FriendRequestOutcome = 'sent' | 'accepted' | 'not-found' | 'self' | 'already'

export interface FriendRequestResponse {
  outcome: FriendRequestOutcome
}

/** How a signed-in viewer stands with a Profile's owner: `sent` when the viewer asked, `received` when they did. */
export type Friendship = 'none' | 'sent' | 'received' | 'friends' | 'self'
