import type {
  Assists,
  ImportRequest,
  ImportResponse,
  MyProgress,
  PutSettingsRequest,
  PuzzleClues,
  PuzzleSummary,
  SavedProgress,
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

export const fetchPuzzles = () => getJson<PuzzleSummary[]>('/api/puzzles')

export const fetchPuzzle = (id: string) => getJson<PuzzleClues>(`/api/puzzles/${encodeURIComponent(id)}`)

export const submitSolve = (id: string, body: SolveRequest, signal: AbortSignal | null = null) =>
  getJson<SolveResponse>(`/api/puzzles/${encodeURIComponent(id)}/solve`, jsonInit('POST', body, { signal }))

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

export const importProgress = (body: ImportRequest) =>
  getJson<ImportResponse>('/api/me/import', jsonInit('POST', body))
