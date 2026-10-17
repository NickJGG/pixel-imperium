/**
 * Parties over one WebSocket per tab at `/ws`, same-origin so the session cookie rides along. A client's first message
 * is `hello`; the server answers with `party` (and, signed in, `presence` and any waiting `invite`s), and again on every
 * reconnect. The socket stays open whether or not the player is in a Party: it carries Friends' presence, invites and
 * the Party's seats, and, while the tab is on the Party's puzzle page (`here`), its shared grid. Grid changes relay to
 * everyone on that page, the sender included; strokes apply in arrival order, so the echo of a client's own stroke is
 * the truth its optimistic copy settles to.
 */
import { type Hint, hashString } from '@pixel-imperium/nonogram'
import type { FriendPresence } from './friends.ts'
import type { SolveStamps } from './index.ts'

/** Bump whenever a message changes shape; a client on another version gets `outdated` and is asked to reload. */
export const PARTY_PROTOCOL = 3

export const PARTY_SEATS = 4

/** A cell as in `SavedProgress.cells`: empty, filled, marked. */
export type PartyCell = '.' | '#' | 'x'

/** One cell of a stroke: its row-major index and what it becomes. */
export interface PartyChange {
  i: number
  to: PartyCell
}

/** An occupied seat; a seat's number is also its color. */
export interface PartySeat {
  seat: number
  /** The player's Handle, or a signed-out guest's "Guest Fox". */
  name: string
  account: boolean
  connected: boolean
  /** Has a tab on the Party's puzzle page; connected but not here is Away. */
  here: boolean
  /** The cell they point at, else the one they last edited; only while here. */
  cursor: number | null
}

export interface PartyState {
  /** The current link code; it changes on New link. */
  code: string
  /** The Host's seat. */
  host: number
  seats: PartySeat[]
  /** The puzzle the Party is solving, if any. */
  puzzle: { id: string; title: string } | null
}

/** The shared grid, sent to a tab as it comes onto the Party's puzzle page. */
export interface PartyGrid {
  puzzleId: string
  /** Row-major `.#x`. */
  cells: string
  solved: boolean
}

/** A friend's invite into their Party. */
export interface PartyInvite {
  id: string
  /** The inviting friend's Handle. */
  from: string
  /** The Host's name. */
  host: string
  /** Seats taken. */
  size: number
  puzzle: { id: string; title: string } | null
}

/** Why a join by link or invite was turned away. */
export type PartyRefusal = Exclude<PartyAccess, 'join'> | 'not-found'

export type PartyClientMsg =
  | { type: 'hello'; protocol: number; deviceToken: string }
  /** Signed in and in no Party: starts one, with this player as Host. */
  | { type: 'start' }
  /** Any signed-in member, to one of their Friends. */
  | { type: 'invite'; handle: string }
  /** Accepting leaves any Party this player is in. */
  | { type: 'respond'; inviteId: string; accept: boolean }
  /** By link; joining leaves any Party this player is in. `started` as for `GET /api/party/:code`. */
  | { type: 'join'; code: string; started?: boolean }
  | { type: 'leave' }
  /** Host only, to a signed-in member. */
  | { type: 'makeHost'; seat: number }
  /** Host only. */
  | { type: 'remove'; seat: number }
  /** Host only. */
  | { type: 'newLink' }
  /** Host only. */
  | { type: 'end' }
  /**
   * The Host's (or, in no Party, a signed-in player's, which starts one): the Party solves this puzzle next. Tabs on
   * the old puzzle's page move with it; members elsewhere get `started`. Not for a Daily.
   */
  | { type: 'play'; puzzleId: string }
  /** The puzzle page this tab is on, or `null` off any; sent on every navigation. */
  | { type: 'here'; puzzleId: string | null }
  /**
   * `id` is the client's, echoed back so it can tell its own stroke. A drag goes out in pieces as it is drawn;
   * `joins` adds a piece to the stroke before it, so the whole drag stays one undo.
   */
  | { type: 'stroke'; id: number; changes: PartyChange[]; joins?: boolean }
  | { type: 'undo' }
  /** Takes back the stroke still being drawn, as if it never was. */
  | { type: 'cancel' }
  /** Host only. On a solved grid it starts a Replay. */
  | { type: 'clear' }
  | { type: 'cursor'; i: number | null }
  | { type: 'ping'; i: number }
  | { type: 'hint' }

export type PartyEndReason = 'host' | 'idle' | 'hostless'

export type PartyServerMsg =
  /** The full list on `hello` and when Friends change; otherwise one changed friend, to merge by Handle. */
  | { type: 'presence'; friends: FriendPresence[]; full: boolean }
  | { type: 'friendRequest'; from: string }
  | { type: 'invite'; invite: PartyInvite }
  /** The invite was answered elsewhere, or its Party ended. */
  | { type: 'uninvite'; id: string }
  /** This player's Party, or `null` in none; `you` is their seat. Sent on every join, leave and change of puzzle. */
  | { type: 'party'; party: PartyState | null; you: number | null }
  | { type: 'seats'; seats: PartySeat[] }
  | { type: 'host'; seat: number }
  | { type: 'link'; code: string }
  /** To members off the old puzzle's page: the Party moved on without them. */
  | { type: 'started'; puzzleId: string; title: string; by: string }
  /** To tabs on the old puzzle's page: go to the new one; its `snapshot` follows. */
  | { type: 'move'; puzzleId: string }
  | { type: 'refused'; reason: PartyRefusal }
  | { type: 'removed' }
  | { type: 'ended'; reason: PartyEndReason }
  | { type: 'snapshot'; grid: PartyGrid }
  /** `id` is the sender's stroke id; `null` for an undo, a cancel or a Clear. */
  | { type: 'stroke'; id: number | null; by: number; changes: PartyChange[] }
  | { type: 'cursor'; seat: number; i: number | null }
  | { type: 'ping'; seat: number; i: number }
  | { type: 'hint'; by: number; hint: Hint }
  /** To each player on their own: what the solve earned them. Never foil; `stamps` only for a fresh signed-in solve. */
  | { type: 'solved'; palette: (string | null)[]; foil: false; crest?: string; stamps?: SolveStamps }
  | { type: 'outdated' }

/** Why the server closed a socket; private-use WebSocket codes. */
export const PARTY_CLOSE = {
  /** A message before `hello`, or a `hello` with neither an Account nor a device token. */
  notAllowed: 4005,
  outdated: 4006,
  /** The server is restarting; parties are saved, so reconnect. */
  restarting: 4007,
} as const

/** Whether a link would let this viewer in, as `join` would decide it. */
export type PartyAccess = 'join' | 'full' | 'removed' | 'ended' | 'retired-closed'

/**
 * `GET /api/party/:code`, for the join card; signed-out devices pass `?device=<token>` (and `?started=1` as
 * elsewhere). `you` is the name they'd join under. 404 for a code that never was.
 */
export type PartyInfo =
  | { access: 'ended' }
  | {
      access: Exclude<PartyAccess, 'ended'>
      host: string
      seats: PartySeat[]
      puzzle: { id: string; title: string } | null
      /** Already holds a seat, so opening the link goes straight back in. */
      seated: boolean
      you?: string
      /** On `retired-closed`: the Author who retired the Party's puzzle. */
      author?: string
    }

const GUEST_ANIMALS = [
  'Fox',
  'Otter',
  'Heron',
  'Badger',
  'Lynx',
  'Wren',
  'Hare',
  'Owl',
  'Seal',
  'Moth',
  'Newt',
  'Crane',
  'Stoat',
  'Finch',
  'Vole',
  'Elk',
] as const

/** A signed-out guest's name, the same on every visit from one device unless `taken` already holds it. */
export function guestName(deviceToken: string, taken: readonly string[] = []): string {
  const start = Math.abs(hashString(deviceToken)) % GUEST_ANIMALS.length
  for (let k = 0; k < GUEST_ANIMALS.length; k++) {
    const name = `Guest ${GUEST_ANIMALS[(start + k) % GUEST_ANIMALS.length]}`
    if (!taken.includes(name)) return name
  }
  return `Guest ${GUEST_ANIMALS[start]}`
}

export const DEVICE_TOKEN = /^[A-Za-z0-9_-]{16,64}$/
