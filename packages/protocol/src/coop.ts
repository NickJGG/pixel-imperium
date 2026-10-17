/**
 * Co-op over one WebSocket at `/ws`, same-origin so the session cookie rides along. A client's first message is
 * `join`; the server answers with a full `snapshot` (and again on every reconnect), then relays every applied change
 * to everyone, the sender included. Strokes apply in arrival order, so the echo of a client's own stroke is the
 * truth its optimistic copy settles to. A connection the server turns away closes with a `COOP_CLOSE` code.
 */
import { type Hint, hashString } from '@pixel-imperium/nonogram'
import type { SolveStamps } from './index.ts'

/** Bump whenever a message changes shape; a client on another version gets `outdated` and is asked to reload. */
export const COOP_PROTOCOL = 1

export const COOP_SEATS = 4

/** A cell as in `SavedProgress.cells`: empty, filled, marked. */
export type CoopCell = '.' | '#' | 'x'

/** One cell of a stroke: its row-major index and what it becomes. */
export interface CoopChange {
  i: number
  to: CoopCell
}

/** An occupied seat. Seat 0 is the Host's; a seat's number is also its color. */
export interface CoopSeat {
  seat: number
  /** The player's Handle, or a signed-out guest's "Guest Fox". */
  name: string
  account: boolean
  connected: boolean
  /** The cell they point at, else the one they last edited. */
  cursor: number | null
}

export interface CoopState {
  /** The current link code; it changes on New link. */
  code: string
  puzzleId: string
  /** Row-major `.#x`. */
  cells: string
  seats: CoopSeat[]
  solved: boolean
}

export type CoopClientMsg =
  /** `started` is a signed-out device's word that it has progress on a Retired puzzle, as `?started=1` elsewhere. */
  | { type: 'join'; code: string; deviceToken: string; protocol: number; started?: boolean }
  /** `id` is the client's, echoed back so it can tell its own stroke. */
  | { type: 'stroke'; id: number; changes: CoopChange[] }
  | { type: 'undo' }
  /** Host only. On a solved grid it starts a Replay. */
  | { type: 'clear' }
  | { type: 'cursor'; i: number | null }
  | { type: 'ping'; i: number }
  | { type: 'hint' }
  /** Host only: Next together, to the Host's Next. */
  | { type: 'next'; puzzleId: string }
  /** Host only. */
  | { type: 'remove'; seat: number }
  /** Host only. */
  | { type: 'newLink' }
  /** Host only. */
  | { type: 'end' }

export type CoopEndReason = 'host' | 'idle'

export type CoopServerMsg =
  | { type: 'snapshot'; room: CoopState; you: number }
  /** `id` is the sender's stroke id; `null` for an undo or a Clear. */
  | { type: 'stroke'; id: number | null; by: number; changes: CoopChange[] }
  | { type: 'cursor'; seat: number; i: number | null }
  | { type: 'ping'; seat: number; i: number }
  | { type: 'seats'; seats: CoopSeat[] }
  | { type: 'hint'; by: number; hint: Hint }
  /** To each player on their own: what the solve earned them. Never foil; `stamps` only for a fresh signed-in solve. */
  | { type: 'solved'; palette: (string | null)[]; foil: false; crest?: string; stamps?: SolveStamps }
  | { type: 'moved'; puzzleId: string; cells: string }
  | { type: 'link'; code: string }
  | { type: 'ended'; reason: CoopEndReason }
  | { type: 'outdated' }

/** Why a co-op connection closed; private-use WebSocket codes. */
export const COOP_CLOSE = {
  removed: 4001,
  full: 4003,
  ended: 4004,
  /** No such co-op, a Retired puzzle this player never started, or a message out of turn. */
  notAllowed: 4005,
  outdated: 4006,
  /** The server is restarting; the co-op is saved, so reconnect. */
  restarting: 4007,
} as const

/** `POST /api/coop`. */
export interface CreateCoopRequest {
  puzzleId: string
}

export interface CreateCoopResponse {
  code: string
}

/** Whether a link would let this viewer in, as `join` would decide it. */
export type CoopAccess = 'join' | 'full' | 'removed' | 'ended' | 'retired-closed'

/**
 * `GET /api/coop/:code`, for the join card; signed-out devices pass `?device=<token>` (and `?started=1` as
 * elsewhere). `you` is the name they'd join under. 404 for a code that never was.
 */
export type CoopRoomInfo =
  | { access: 'ended' }
  | {
      access: Exclude<CoopAccess, 'ended'>
      host: string
      puzzleId: string
      title: string
      seats: CoopSeat[]
      you?: string
      /** On `retired-closed`: the Author who retired it. */
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
