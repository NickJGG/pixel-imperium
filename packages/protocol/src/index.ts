import type { Clues, Hint } from '@pixel-imperium/nonogram'

export type { SeedPuzzle } from '@pixel-imperium/nonogram'

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
  /** A player-made puzzle taken down by an admin: an empty slot, its title blank. */
  removed?: true
}

/**
 * A player-made Puzzle's place: its Author's handle, the paper they picked (absent = the Workshop's), and its
 * Campaign and Province (`"1"`–`"6"`) when it's in one. `retired` reaches only players who started it.
 */
export interface MadeContext {
  author: string
  paper?: Paper
  campaign?: { id: string; provinceId: string }
  retired?: true
}

/** Where a puzzle belongs: an official Campaign's Province, a Daily's `YYYY-MM-DD` date, or its Author. */
export type PuzzleContext = { campaignId: string; provinceId: string } | { daily: string } | { made: MadeContext }

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

/**
 * The named papers in tokens.css: one per campaign province, one per season, and the Workshop's. Campaigns and
 * provinces each name one; a new one needs its `--p-` in every theme and its `--t-` in Night.
 */
export const PAPER_NAMES = [
  'marches',
  'coast',
  'wildwood',
  'forge',
  'capital',
  'throne',
  'timber',
  'teal',
  'sand',
  'lime',
  'glacier',
  'ember',
  'winter',
  'spring',
  'summer',
  'autumn',
  'workshop',
] as const

export type PaperId = (typeof PAPER_NAMES)[number]

/** A named paper, or a player-made one: a hex the client derives a paper and tab from per theme. */
export type Paper = PaperId | `#${string}`

/** `GET /api/campaigns` returns `CampaignSummary[]`, in default-first order. */
export interface CampaignSummary {
  id: string
  name: string
  /** `YYYY-MM-DD`; absent in a draft without one. */
  released?: string
  paper: Paper
  /** Its puzzles across every province. */
  total: number
}

export interface Province {
  id: string
  name: string
  /** A few words under the name, e.g. "Ports and the sea". */
  theme: string
  /** Shown once the province is conquered. */
  flavour: string
  paper: Paper
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
  /** As `CampaignSummary`'s. */
  released?: string
  paper: Paper
  closingLine: string
  /**
   * Absent in a draft without one; colors come one per solve, beside the palette. `holes` are row-major indices with
   * no pixel, absent when there are none.
   */
  crest?: { width: number; height: number; holes?: number[] }
  provinces: Province[]
  /** A player-made campaign's Author's handle; its provinces are id'd `"1"`–`"6"`. */
  author?: string
  /** A player-made campaign its Author retired; only players who started it are served it. */
  retired?: true
}

/**
 * 410 from `GET /api/puzzles/:id` or `/api/campaigns/:id` for player-made work its Author retired, to a player who
 * never started it. Signed-out clients with device progress pass `?started=1`, as on every puzzle request.
 */
export interface RetiredError extends ApiError {
  retired: true
  author: string
}

/** `POST /api/puzzles/:id/solve`; `cells` is row-major, marks sent as `'empty'`. */
export interface SolveRequest {
  cells: ('filled' | 'empty')[]
  /** The Attempt's Solve time; it can lower the account's Best time unless `hinted`. */
  ms?: number
  /** A Hint was used in this Attempt. */
  hinted?: boolean
}

/**
 * On success, `palette` is row-major hex colors, `null` for empty cells. `foil` is the account's
 * sticker as recorded, `null` when signed out (the device decides). `crest` is the puzzle's Crest
 * pixel color, absent when its campaign has no Crest. `stamps` is absent when signed out.
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
  /** Active time spent on the current Attempt. */
  elapsedMs: number
  /** A Hint was used in the current Attempt, so its solve can't set a Best time. */
  attemptHinted: boolean
}

export interface PutProgressResponse {
  applied: boolean
}

export interface PuzzleRecord {
  solved: SolveStatus | null
  progress: SavedProgress | null
  /** Reveal colors, present only for a verified solve. */
  palette: (string | null)[] | null
  /** Its Crest pixel color, like `palette`. */
  crest: string | null
  foil: boolean
  /** A hint was given on the puzzle, so a first solve won't be foil. */
  hinted: boolean
  /** When it was first solved; present only for a verified solve. */
  solvedAt: string | null
  /** The fastest unhinted Solve time, if one was recorded. */
  bestMs: number | null
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
  /** The in-progress Attempt's active time, with `cells`. */
  elapsedMs?: number
  /** The device's Best time; kept only with a solve. */
  bestMs?: number
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

/** A player-picked paper: `#rrggbb`. */
export type HexPaper = `#${string}`

/** `PUT /api/me/drafts/puzzles/:id` takes one without `id`; kept only if `updatedAt` is newer than the stored copy. */
export interface DraftPuzzle {
  id: string
  title: string
  width: number
  height: number
  /** Row-major hex colors, `null` for empty cells. */
  cells: (string | null)[]
  /** The color strip's order. */
  colors: string[]
  paper: HexPaper | null
  updatedAt: string
}

export type DraftPuzzleSummary = Omit<DraftPuzzle, 'cells' | 'colors'>

/** A crest as drawn: `rows` in `palette` keys, `regions` in 1-based province numbers, `.` in both for a hole. */
export interface CrestDraft {
  palette: Record<string, string>
  rows: string[]
  regions: string[]
}

export interface DraftProvince {
  name: string
  flavour: string
  paper: HexPaper | null
  /** The Author's draft or published puzzle ids, in play order. */
  puzzleIds: string[]
}

export interface DraftCampaignDoc {
  title: string
  paper: HexPaper | null
  provinces: DraftProvince[]
  crest: CrestDraft | null
}

/** A draft campaign as the server last checked it: tier cuts and the publish rules, per province. */
export interface CampaignPreview {
  provinces: {
    /** As `ProvinceDef.tiers`: 1-based slots where Medium and Hard start; `null` under 9 puzzles or with a stall. */
    tiers: [number, number] | null
    puzzles: PreviewPuzzle[]
  }[]
  /** Filled crest pixels against puzzles, and whether each province's region fits; `null` without a crest. */
  crest: { pixels: number; puzzles: number; fits: boolean } | null
}

export interface PreviewPuzzle {
  id: string
  /** `missing`: no draft or published puzzle of yours; `taken`: in another published campaign; `fails`: breaks a publish rule. */
  problem?: 'missing' | 'taken' | 'fails'
  /** Line-logic sweeps, `null` where it stalls or the puzzle is missing. */
  passes: number | null
  width: number
  height: number
}

/** `GET` and `PUT /api/me/drafts/campaigns/:id`; `PUT` takes `{ doc, updatedAt }`. */
export interface DraftCampaign {
  id: string
  doc: DraftCampaignDoc
  updatedAt: string
  preview: CampaignPreview
}

export interface DraftCampaignSummary {
  id: string
  title: string
  paper: HexPaper | null
  createdAt: string
  updatedAt: string
}

export const DRAFT_CAMPAIGN_CAP = 10

/**
 * `GET /api/me/drafts`: puzzles newest-edited first, campaigns oldest-started first. Capped at 200 puzzles and
 * `DRAFT_CAMPAIGN_CAP` campaigns; a `PUT` past a cap answers 409.
 */
export interface Drafts {
  puzzles: DraftPuzzleSummary[]
  campaigns: DraftCampaignSummary[]
}

export interface PutDraftPuzzleResponse {
  applied: boolean
}

export interface PutDraftCampaignResponse {
  applied: boolean
  /** Of the stored doc, whether or not this one applied. */
  preview: CampaignPreview
}

/** `POST /api/me/drafts/puzzles/:id/publish`; title and paper override the draft's. */
export interface PublishPuzzleRequest {
  title?: string
  paper?: HexPaper | null
}

/**
 * `POST .../publish` answers 201 with the new id, 403 to a banned Author, 429 past 20 puzzles or 3 campaigns a day, and
 * 422 with `PublishRejection` when a rule fails.
 */
export interface PublishResponse {
  id: string
}

export interface PublishRejection extends ApiError {
  /** For a campaign, the preview showing which puzzles or provinces fail. */
  preview?: CampaignPreview
}

/** A published province: `tiers` set for good at publish. */
export interface MadeProvince {
  name: string
  flavour: string
  paper: HexPaper | null
  puzzleIds: string[]
  tiers: [number, number] | null
}

/** One of the Author's published puzzles; they always see its picture. */
export interface MadePuzzleSummary extends PuzzleSummary {
  paper: HexPaper | null
  palette: (string | null)[]
  campaignId: string | null
  createdAt: string
  retired?: true
  removed?: true
}

export interface MadeCampaignSummary {
  id: string
  title: string
  paper: HexPaper
  total: number
  createdAt: string
  retired?: true
  removed?: true
}

/** `GET /api/me/made`: the Author's published work, newest first. */
export interface Made {
  puzzles: MadePuzzleSummary[]
  campaigns: MadeCampaignSummary[]
}

/**
 * `PATCH /api/me/made/puzzles/:id` and `.../campaigns/:id`: the parts that never touch progress. `provinces`, when
 * sent, has one entry per province.
 */
export interface PatchMadePuzzle {
  title?: string
  paper?: HexPaper | null
}

export interface PatchMadeCampaign {
  title?: string
  paper?: HexPaper
  provinces?: { name: string; flavour: string; paper: HexPaper | null }[]
}

/** `DELETE /api/me/made/...` answers 409 with this once another Account has started it; retire it instead. */
export interface DeleteRejection extends ApiError {
  retire: true
}

/** Player-made work an Account played by link, someone else's, most recently played first. */
export interface PlayedPuzzle extends PuzzleSummary {
  author: string
  paper: HexPaper | null
  solved: boolean
  retired?: true
}

export interface PlayedCampaign {
  id: string
  title: string
  author: string
  paper: HexPaper
  total: number
  solved: number
  retired?: true
  removed?: true
}

/** `GET /api/me/played`: standalone puzzles, and campaigns any of whose puzzles were played. */
export interface Played {
  puzzles: PlayedPuzzle[]
  campaigns: PlayedCampaign[]
}

/** `POST /api/reports`, signed in or out; 204, or 404 for no such player-made work. */
export interface ReportRequest {
  targetId: string
  reason: string
}

export * from './coop.ts'
