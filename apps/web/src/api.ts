import type {
  Assists,
  Campaign,
  CampaignSummary,
  CoopRoomInfo,
  DailyYear,
  DeleteRejection,
  DraftCampaign,
  DraftCampaignDoc,
  DraftPuzzle,
  Drafts,
  HandleAvailability,
  HandleRejection,
  HintRequest,
  HintResponse,
  ImportRequest,
  ImportResponse,
  Made,
  MyProgress,
  PatchMadePuzzle,
  Played,
  Profile,
  PublishPuzzleRequest,
  PublishRejection,
  PublishResponse,
  PutHandleRequest,
  PutHandleResponse,
  PutSettingsRequest,
  PutDraftCampaignResponse,
  PutDraftPuzzleResponse,
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

/** A co-op link as the join card sees it; `null` for a code that never was. A signed-out device passes its token. */
export async function fetchCoop(code: string, device: string | null, started = false): Promise<CoopRoomInfo | null> {
  const query = new URLSearchParams({ ...(device && { device }), ...(started && { started: '1' }) })
  const res = await fetch(`/api/coop/${encodeURIComponent(code)}${query.size > 0 ? `?${query}` : ''}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as CoopRoomInfo
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

/** `null` when the account has no draft by that id. */
export async function fetchDraftPuzzle(id: string): Promise<DraftPuzzle | null> {
  const res = await fetch(`/api/me/drafts/puzzles/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as DraftPuzzle
}

export const putDraftPuzzle = (id: string, body: Omit<DraftPuzzle, 'id'>, keepalive: boolean) =>
  getJson<PutDraftPuzzleResponse>(`/api/me/drafts/puzzles/${encodeURIComponent(id)}`, jsonInit('PUT', body, { keepalive }))

/** The new id, or why the server refused: its status and message. */
export async function publishPuzzle(
  draftId: string,
  body: PublishPuzzleRequest,
): Promise<PublishResponse | { status: number; error: string }> {
  const res = await fetch(`/api/me/drafts/puzzles/${encodeURIComponent(draftId)}/publish`, jsonInit('POST', body))
  const json = (await res.json().catch(() => ({}))) as Partial<PublishResponse & { error: string }>
  if (res.ok && json.id) return { id: json.id }
  return { status: res.status, error: json.error ?? res.statusText }
}

export const fetchDrafts = () => getJson<Drafts>('/api/me/drafts')

export const putDraftCampaign = (id: string, body: { doc: DraftCampaignDoc; updatedAt: string }, keepalive = false) =>
  getJson<PutDraftCampaignResponse>(`/api/me/drafts/campaigns/${encodeURIComponent(id)}`, jsonInit('PUT', body, { keepalive }))

/** Saves a draft campaign by a new id; `null` when the account already has as many as it may. */
export async function startDraftCampaign(id: string, body: { doc: DraftCampaignDoc; updatedAt: string }) {
  const res = await fetch(`/api/me/drafts/campaigns/${encodeURIComponent(id)}`, jsonInit('PUT', body))
  if (res.status === 409) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as PutDraftCampaignResponse
}

/** `null` when the account has no draft campaign by that id. */
export async function fetchDraftCampaign(id: string): Promise<DraftCampaign | null> {
  const res = await fetch(`/api/me/drafts/campaigns/${encodeURIComponent(id)}`)
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as DraftCampaign
}

export async function deleteDraftCampaign(id: string): Promise<void> {
  const res = await fetch(`/api/me/drafts/campaigns/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

/** The new id, or why the server refused: its status, message and, for a broken rule, the preview showing where. */
export async function publishCampaign(
  draftId: string,
): Promise<PublishResponse | (PublishRejection & { status: number })> {
  const res = await fetch(`/api/me/drafts/campaigns/${encodeURIComponent(draftId)}/publish`, { method: 'POST' })
  const json = (await res.json().catch(() => ({}))) as Partial<PublishResponse & PublishRejection>
  if (res.ok && json.id) return { id: json.id }
  return { status: res.status, error: json.error ?? res.statusText, ...(json.preview && { preview: json.preview }) }
}

export const fetchMade = () => getJson<Made>('/api/me/made')

export const fetchPlayed = () => getJson<Played>('/api/me/played')

export async function patchMadePuzzle(id: string, body: PatchMadePuzzle): Promise<void> {
  const res = await fetch(`/api/me/made/puzzles/${encodeURIComponent(id)}`, jsonInit('PATCH', body))
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

export async function retireMadePuzzle(id: string): Promise<void> {
  const res = await fetch(`/api/me/made/puzzles/${encodeURIComponent(id)}/retire`, { method: 'POST' })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
}

/** `'retire'` when others have started it, so it can only be retired. */
export async function deleteMadePuzzle(id: string): Promise<'deleted' | 'retire'> {
  const res = await fetch(`/api/me/made/puzzles/${encodeURIComponent(id)}`, { method: 'DELETE' })
  if (res.status === 409 && ((await res.json().catch(() => null)) as DeleteRejection | null)?.retire) return 'retire'
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return 'deleted'
}
