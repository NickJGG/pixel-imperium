import type { Clues, Hint } from '@pixel-imperium/nonogram'

export type Tier = 'easy' | 'medium' | 'hard'

export interface PuzzleSummary {
  id: string
  title: string
  width: number
  height: number
  /** Filled cells in the solution; derivable from the clues, so it leaks nothing. */
  filledCount: number
  /** Relative to its province; absent in a draft province with no cuts. */
  tier?: Tier
  /** Its row-major pixel in the campaign's Crest; in campaign payloads only, absent without a Crest. */
  crest?: number
}

/** Where a puzzle belongs: a Campaign's Province, or a Daily's `YYYY-MM-DD` date. */
export type PuzzleContext = { campaignId: string; provinceId: string } | { daily: string }

/** `GET /api/puzzles/:id`. Never includes the solution or palette. */
export type PuzzleClues = PuzzleSummary & PuzzleContext & { clues: Clues }

/** A Daily in its Year; `date` is `YYYY-MM-DD`. */
export interface DailySummary extends PuzzleSummary {
  date: string
}

/**
 * `GET /api/daily/:year`. `months[0]` is January; each lists its Dailies by date, only up to the last date that is
 * "today" somewhere on Earth, so nothing still to come is named. `launch` is the first date with a Daily.
 */
export interface DailyYear {
  year: number
  launch: string
  months: DailySummary[][]
}

/** `GET /api/campaigns` returns `CampaignSummary[]`, in default-first order. */
export interface CampaignSummary {
  id: string
  name: string
  /** The volume's cover colour on the shelf; the album's cobalt when absent. */
  coverColour?: string
}

export interface Province {
  id: string
  name: string
  /** A few words under the name, e.g. "Ports and the sea". */
  theme: string
  /** Shown once the province is conquered. */
  flavour: string
  /** The longest a puzzle's side gets here. */
  maxSize: number
  /** Offer the Techniques when this province starts. */
  techniques?: true
  /** Easiest first. */
  puzzles: PuzzleSummary[]
}

/** `GET /api/campaigns/:id`. Provinces in unlock order; locking is left to the client. */
export interface Campaign {
  id: string
  name: string
  closingLine: string
  /** Absent in a draft without one; colours come one per solve, beside the palette. */
  crest?: { width: number; height: number }
  provinces: Province[]
}

/** `POST /api/puzzles/:id/solve`; `cells` is row-major, marks sent as `'empty'`. */
export interface SolveRequest {
  cells: ('filled' | 'empty')[]
}

/**
 * On success, `palette` is row-major hex colors, `null` for empty cells. `foil` is the account's
 * sticker as recorded, `null` when signed out (the device decides). `crest` is the puzzle's Crest
 * pixel colour, absent when its campaign has no Crest. `stamps` is absent when signed out.
 */
export type SolveResponse =
  | { solved: true; palette: (string | null)[]; foil: boolean | null; crest?: string; stamps?: SolveStamps }
  | { solved: false }

/** The Stamps a solve brings in reach, in the puzzle's Campaign or Year. */
export interface SolveStamps {
  /** Earned by this solve, in `StampId` order; none for a puzzle already verified. */
  earned: StampId[]
  /** Ones not yet earned, nearest first. */
  near: StampProgress[]
}

/** `have` of the `need` solves a Stamp takes: in a foil run, within 24 hours, or on a page. */
export interface StampProgress {
  id: StampId
  have: number
  need: number
}

/** `POST /api/puzzles/:id/hint`; `cells` as in `SavedProgress`. */
export interface HintRequest {
  cells: string
}

/**
 * A row-major cell index: a cell that disagrees with the solution, or, when there are none, a cell
 * still to fill. Answers 409 when the grid has nothing left to hint.
 */
export type HintResponse = Hint

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
  /** Its Crest pixel colour, like `palette`. */
  crest: string | null
  foil: boolean
  /** A hint was given on the puzzle, so a first solve won't be foil. */
  hinted: boolean
  /** When it was first solved; present only for a verified solve. */
  solvedAt: string | null
}

/**
 * `GET /api/me/progress`; `assists` is `null` until the account first saves them. `tutorialAskedAt` and
 * `techniquesAskedAt` are when the player was first offered the Tutorial and the Techniques, set once by
 * `PUT /api/me/tutorial` and `PUT /api/me/techniques`.
 */
export interface MyProgress {
  puzzles: Record<string, PuzzleRecord>
  assists: Assists | null
  showcase: string[]
  tutorialAskedAt: string | null
  techniquesAskedAt: string | null
  /** Finished Lessons as `<track>:<lesson>` keys, each added by `PUT /api/me/lessons/:key`. */
  lessonsDone: string[]
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

/** A campaign, or a Year of Dailies (id `daily-<year>`), the player has verified solves in. */
export interface ProfileCampaign {
  id: string
  verifiedPuzzleIds: string[]
  /** The foil ones among `verifiedPuzzleIds`. */
  foilPuzzleIds: string[]
  /** Puzzle id → ISO time of its verified solve. */
  solvedAt: Record<string, string>
  /** Earned ones only, in `StampId` order. */
  stamps: ProfileStamp[]
}

/**
 * A campaign's Stamps, derived from its verified solves: the first sticker and first foil, five foils in a row,
 * ten solves within 24 hours, a page all foil, each page but the last conquered, and the last one completing the album.
 * A Year has no spree; each Month completes on its own (`month-complete:<mm>`, `01`–`12`) and `year-complete` needs them all.
 */
export type StampId =
  | 'first-sticker'
  | 'first-foil'
  | 'foil-run'
  | 'spree'
  | 'perfect-page'
  | `conquered:${string}`
  | 'album-complete'
  | `month-complete:${string}`
  | 'year-complete'

export interface ProfileStamp {
  id: StampId
  /** ISO time of the solve that earned it. */
  earnedAt: string
}

/** `GET /api/users/:handle`, public, and counting only verified solves, even for the owner. */
export interface Profile {
  handle: string
  image: string | null
  joinedAt: string
  verifiedSolves: number
  /** Most recently solved in first. */
  campaigns: ProfileCampaign[]
  /** Years of Dailies, shaped like campaigns, most recently solved in first. */
  years: ProfileCampaign[]
  /** Puzzle ids the player picked, biggest first; empty when they haven't, and the album falls back. */
  showcase: string[]
}
