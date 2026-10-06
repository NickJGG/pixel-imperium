import type { PuzzleClues, PuzzleSummary, SolveRequest, SolveResponse } from '@pixel-imperium/protocol'

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return (await res.json()) as T
}

export const fetchPuzzles = () => getJson<PuzzleSummary[]>('/api/puzzles')

export const fetchPuzzle = (id: string) => getJson<PuzzleClues>(`/api/puzzles/${encodeURIComponent(id)}`)

export const submitSolve = (id: string, body: SolveRequest, signal: AbortSignal) =>
  getJson<SolveResponse>(`/api/puzzles/${encodeURIComponent(id)}/solve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  })
