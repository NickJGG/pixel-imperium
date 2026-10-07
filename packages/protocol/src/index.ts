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

/** On success, `palette` is row-major hex colors, `null` for empty cells. */
export type SolveResponse = { solved: true; palette: (string | null)[] } | { solved: false }

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
}

/** `GET /api/me/progress`; `assists` is `null` until the account first saves them. */
export interface MyProgress {
  puzzles: Record<string, PuzzleRecord>
  assists: Assists | null
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
}

/** `GET /api/users/:handle`, public, and counting only verified solves, even for the owner. */
export interface Profile {
  handle: string
  image: string | null
  joinedAt: string
  verifiedSolves: number
  /** Most recently solved in first. */
  campaigns: ProfileCampaign[]
}
