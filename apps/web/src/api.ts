import type {
  Assists,
  Campaign,
  CampaignSummary,
  DailyYear,
  HandleAvailability,
  HandleRejection,
  HintRequest,
  HintResponse,
  ImportRequest,
  ImportResponse,
  MyProgress,
  Profile,
  PutHandleRequest,
  PutHandleResponse,
  PutSettingsRequest,
  PuzzleClues,
  ReportRequest,
  RetiredError,
  SavedProgress,
  Showcase,
  SolveRequest,
  SolveResponse,
} from '@pixel-imperium/protocol'

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

const jsonInit = (method: string, body: unknown, init?: RequestInit): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
  ...init,
})

export const fetchCampaigns = () => getJson<CampaignSummary[]>('/api/campaigns')

/**
 * A signed-out device telling the server it has progress in player-made work, which keeps serving it once retired.
 * A signed-in request is judged by the account's own progress instead.
 */
const startedQuery = (started: boolean) => (started ? '?started=1' : '')

export const isRetired = (found: object): found is RetiredError => 'retired' in found && 'error' in found

/** `null` when no campaign has the id; the 410's body when its Author retired it before this player started it. */
export async function fetchCampaign(id: string, started = false): Promise<Campaign | RetiredError | null> {
  const res = await fetch(`/api/campaigns/${encodeURIComponent(id)}${startedQuery(started)}`)
  if (res.status === 404) return null
  if (!res.ok && res.status !== 410) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as Campaign | RetiredError
}

/** `null` when the Year has no Dailies: before launch, or still to come. */
export async function fetchDailyYear(year: number): Promise<DailyYear | null> {
  const res = await fetch(`/api/daily/${year}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as DailyYear
}

/** `null` when no puzzle has the id; the 410's body when its Author retired it before this player started it. */
export async function fetchPuzzle(id: string, started = false): Promise<PuzzleClues | RetiredError | null> {
  const res = await fetch(`/api/puzzles/${encodeURIComponent(id)}${startedQuery(started)}`)
  if (res.status === 404) return null
  if (!res.ok && res.status !== 410) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as PuzzleClues | RetiredError
}

// A board being played was served to this device, so a retired puzzle's solve and hints are its to finish.
export const submitSolve = (id: string, body: SolveRequest, signal: AbortSignal | null = null) =>
  getJson<SolveResponse>(`/api/puzzles/${encodeURIComponent(id)}/solve${startedQuery(true)}`, jsonInit('POST', body, { signal }))

/** `null` when the grid has nothing left to hint. */
export async function requestHint(id: string, body: HintRequest): Promise<HintResponse | null> {
  const res = await fetch(`/api/puzzles/${encodeURIComponent(id)}/hint${startedQuery(true)}`, jsonInit('POST', body))
  if (res.status === 409) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as HintResponse
}

export const fetchMyProgress = () => getJson<MyProgress>('/api/me/progress')

/** Rejects only when retrying could help; a grid the server refuses as invalid is dropped. */
export async function putProgress(id: string, body: SavedProgress, keepalive: boolean): Promise<void> {
  const res = await fetch(`/api/me/progress/${encodeURIComponent(id)}`, jsonInit('PUT', body, { keepalive }))
  if (res.status === 401 || res.status >= 500) throw new Error(`${res.status} ${res.statusText}`)
}

export async function putSettings(assists: Assists): Promise<void> {
  const res = await fetch('/api/me/settings', jsonInit('PUT', { assists } satisfies PutSettingsRequest))
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

/** Records that a track was offered; the server keeps the first time. */
export async function putAsked(offer: 'tutorial' | 'techniques'): Promise<void> {
  const res = await fetch(`/api/me/${offer}`, { method: 'PUT' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

/** Records a finished Lesson by its `<track>:<lesson>` key. */
export async function putLessonDone(key: string): Promise<void> {
  const res = await fetch(`/api/me/lessons/${key}`, { method: 'PUT' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

export const putShowcase = (puzzleIds: string[]) =>
  getJson<Showcase>('/api/me/showcase', jsonInit('PUT', { puzzleIds } satisfies Showcase))

export const importProgress = (body: ImportRequest) =>
  getJson<ImportResponse>('/api/me/import', jsonInit('POST', body))

/** `null` when no account has the handle. */
export async function fetchProfile(handle: string): Promise<Profile | null> {
  const res = await fetch(`/api/users/${encodeURIComponent(handle)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as Profile
}

export const checkHandle = (handle: string, signal: AbortSignal) =>
  getJson<HandleAvailability>(`/api/handles/${encodeURIComponent(handle)}/available`, { signal })

/** Resolves to the rejection when the server refuses the handle; rejects only on failures worth retrying. */
export async function putHandle(handle: string): Promise<PutHandleResponse | HandleRejection> {
  const res = await fetch('/api/me/handle', jsonInit('PUT', { handle } satisfies PutHandleRequest))
  if (!res.ok && res.status !== 400 && res.status !== 409) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as PutHandleResponse | HandleRejection
}

/** Reports player-made work, signed in or out. */
export async function postReport(body: ReportRequest): Promise<void> {
  const res = await fetch('/api/reports', jsonInit('POST', body))
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}
