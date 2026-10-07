import type { Clues } from '@pixel-imperium/nonogram'

export interface PuzzleSummary {
  id: string
  title: string
  width: number
  height: number
  /** Filled cells in the solution; derivable from the clues, so it leaks nothing. */
  filledCount: number
}

/** `GET /api/puzzles/:id`. Never includes the solution or palette. */
export interface PuzzleClues extends PuzzleSummary {
  campaignId: string
  provinceId: string
  clues: Clues
}

/** `GET /api/campaigns` returns `CampaignSummary[]`, in default-first order. */
export interface CampaignSummary {
  id: string
  name: string
  /** The volume's cover colour on the shelf; the album's cobalt when absent. */
  coverColour?: string
}

/**
 * Province Maps by province index, stacked top to bottom with map i's top at i × `step`, each `width` ×
 * `height` with row-major colours. Landmarks are map-local; the Road is in journey coordinates, first
 * province to last, and `roadStops` holds its index at each Landmark.
 */
export interface CampaignJourney {
  width: number
  height: number
  step: number
  maps: { colors: (string | null)[]; landmark: { x: number; y: number } }[]
  road: { x: number; y: number }[]
  roadStops: number[]
}

export interface Province {
  id: string
  name: string
  /** A few words under the name, e.g. "Ports and the sea". */
  theme: string
  /** Shown once the province is conquered. */
  flavour: string
  /** Easiest first. */
  puzzles: PuzzleSummary[]
}

/** `GET /api/campaigns/:id`. Provinces in unlock order; locking is left to the client. */
export interface Campaign {
  id: string
  name: string
  closingLine: string
  journey: CampaignJourney
  provinces: Province[]
}

/** `POST /api/puzzles/:id/solve`; `cells` is row-major, marks sent as `'empty'`. */
export interface SolveRequest {
  cells: ('filled' | 'empty')[]
}

/**
 * On success, `palette` is row-major hex colors, `null` for empty cells. `foil` is the account's
 * sticker as recorded, `null` when signed out (the device decides).
 */
export type SolveResponse = { solved: true; palette: (string | null)[]; foil: boolean | null } | { solved: false }

/** `POST /api/puzzles/:id/hint`; `cells` as in `SavedProgress`. */
export interface HintRequest {
  cells: string
}

/**
 * A row-major cell index: a cell that disagrees with the solution, or, when there are none, a cell
 * still to fill. Answers 409 when the grid has nothing left to hint.
 */
export type HintResponse = { kind: 'mistake' | 'reveal'; index: number }

export interface ApiError {
  error: string
}

/** Play assists synced to an account; the theme stays per device. */
export interface Assists {
  fadeClues: boolean
  impossibleLines: boolean
  autoMarkEmptyLines: boolean
  crosshair: boolean
  lockLine: boolean
}

export type SolveStatus = 'verified' | 'unverified'

/**
 * A saved grid; `cells` is row-major `.#x` (empty, filled, marked).
 * `PUT /api/me/progress/:id` takes one and keeps it only if `updatedAt` is newer than the stored copy.
 */
export interface SavedProgress {
  cells: string
  replaying: boolean
  updatedAt: string
}

export interface PutProgressResponse {
  applied: boolean
}

export interface PuzzleRecord {
  solved: SolveStatus | null
  progress: SavedProgress | null
  /** Reveal colors, present only for a verified solve. */
  palette: (string | null)[] | null
  foil: boolean
  /** A hint was given on the puzzle, so a first solve won't be foil. */
  hinted: boolean
}

/** `GET /api/me/progress`; `assists` is `null` until the account first saves them. */
export interface MyProgress {
  puzzles: Record<string, PuzzleRecord>
  assists: Assists | null
  showcase: string[]
}

/**
 * `PUT /api/me/showcase`: up to three distinct puzzle ids, each a verified solve of the player, biggest
 * sticker first. Answers 400 otherwise, and echoes the request on success.
 */
export interface Showcase {
  puzzleIds: string[]
}

/** `PUT /api/me/settings`. */
export interface PutSettingsRequest {
  assists: Assists
}

/** One puzzle's signed-out data; `cells` as in `SavedProgress`. */
export interface ImportItem {
  id: string
  cells?: string
  solved: boolean
  replaying: boolean
  /** A hint was used on this device; the solve itself is never foil either way. */
  hinted?: boolean
}

/** `POST /api/me/import`. */
export interface ImportRequest {
  puzzles: ImportItem[]
}

/** What each item became: a solve, just a saved grid, or nothing (unknown puzzle, nothing usable). */
export type ImportOutcome = SolveStatus | 'progress' | 'ignored'

export interface ImportResponse {
  results: Record<string, ImportOutcome>
}

/** Why a handle can't be used: wrong length, characters other than `a-z0-9_`, reserved, blocklisted, or held by another account. */
export type HandleProblem = 'length' | 'characters' | 'reserved' | 'blocked' | 'taken'

/** `GET /api/handles/:handle/available`; the signed-in player's own handle counts as available. */
export type HandleAvailability = { available: true } | { available: false; reason: HandleProblem }

/** `PUT /api/me/handle` sets and confirms the handle; it answers `HandleRejection` with 400 or 409. */
export interface PutHandleRequest {
  handle: string
}

export interface PutHandleResponse {
  handle: string
}

export interface HandleRejection extends ApiError {
  reason: HandleProblem
}

/** A campaign the player has verified solves in. */
export interface ProfileCampaign {
  id: string
  verifiedPuzzleIds: string[]
  /** The foil ones among `verifiedPuzzleIds`. */
  foilPuzzleIds: string[]
}

/** `GET /api/users/:handle`, public, and counting only verified solves, even for the owner. */
export interface Profile {
  handle: string
  image: string | null
  joinedAt: string
  verifiedSolves: number
  /** Most recently solved in first. */
  campaigns: ProfileCampaign[]
  /** Puzzle ids the player picked, biggest first; empty when they haven't, and the album falls back. */
  showcase: string[]
}
