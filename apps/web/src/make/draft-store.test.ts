import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DraftPuzzle } from '@pixel-imperium/protocol'
import { stubStorage } from '../test-storage.ts'
import { blankDraft, paint } from './draft.ts'

const api = vi.hoisted(() => ({
  putDraftPuzzle: vi.fn(async (..._: unknown[]) => ({ applied: true })),
  fetchDraftPuzzle: vi.fn(async (_: string): Promise<DraftPuzzle | null> => null),
}))
vi.mock('../api.ts', () => api)
vi.mock('../content.ts', () => ({ forgetWorkshop: () => {} }))

const store = await import('./draft-store.ts')

const at = (iso: string) => ({ draft: blankDraft(5, 5), paper: null, updatedAt: iso, unsent: false })
const dot = () => paint(store.getDraft(), [{ row: 0, col: 0 }], store.getDraft().colors[0]!)

describe('draft-store', () => {
  beforeEach(() => {
    stubStorage()
    vi.useFakeTimers()
    api.putDraftPuzzle.mockClear()
    api.fetchDraftPuzzle.mockReset().mockResolvedValue(null)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('keeps an edit on the device at once and sends it 30 s later', async () => {
    const key = { userId: 'u1', id: 'd-a' }
    store.openDraft(key, at('2026-01-01T00:00:00.000Z'))
    store.commit(dot())
    expect(store.localDraft(key)).toMatchObject({ unsent: true, draft: { cells: store.getDraft().cells } })
    await vi.advanceTimersByTimeAsync(29_000)
    expect(api.putDraftPuzzle).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1_000)
    expect(api.putDraftPuzzle).toHaveBeenCalledTimes(1)
    expect(api.putDraftPuzzle.mock.calls[0]![0]).toBe('d-a')
    expect(store.localDraft(key)?.unsent).toBe(false)
  })

  it('sends the draft it leaves when another opens', async () => {
    store.openDraft({ userId: 'u1', id: 'd-b' }, at('2026-01-01T00:00:00.000Z'))
    store.commit(dot())
    store.openDraft({ userId: 'u1', id: 'd-c' }, at('2026-01-01T00:00:00.000Z'))
    await vi.advanceTimersByTimeAsync(0)
    expect(api.putDraftPuzzle).toHaveBeenCalledTimes(1)
    expect(api.putDraftPuzzle.mock.calls[0]![0]).toBe('d-b')
    expect(store.localDraft({ userId: 'u1', id: 'd-b' })?.unsent).toBe(false)
  })

  it('keeps an edit made while a send is out as unsent', async () => {
    let finish = () => {}
    api.putDraftPuzzle.mockImplementationOnce(() => new Promise(resolve => (finish = () => resolve({ applied: true }))))
    const key = { userId: 'u1', id: 'd-d' }
    store.openDraft(key, at('2026-01-01T00:00:00.000Z'))
    store.commit(dot())
    const sent = store.flushDraft()
    vi.setSystemTime(Date.now() + 1000)
    store.commit({ ...store.getDraft(), title: 'Later' })
    finish()
    expect(await sent).toBe(true)
    expect(store.localDraft(key)).toMatchObject({ unsent: true, draft: { title: 'Later' } })
  })

  it('keeps the edit to send later when the server is out of reach', async () => {
    store.openDraft({ userId: 'u1', id: 'd-e' }, at('2026-01-01T00:00:00.000Z'))
    api.putDraftPuzzle.mockRejectedValueOnce(new Error('offline'))
    store.commit(dot())
    expect(await store.flushDraft()).toBe(false)
    expect(store.localDraft({ userId: 'u1', id: 'd-e' })?.unsent).toBe(true)
  })

  it('never sends the dev draft', async () => {
    store.openDraft({ userId: null, id: 'make' }, at('2026-01-01T00:00:00.000Z'))
    api.putDraftPuzzle.mockClear()
    store.commit(dot())
    await vi.advanceTimersByTimeAsync(60_000)
    expect(await store.flushDraft()).toBe(true)
    expect(api.putDraftPuzzle).not.toHaveBeenCalled()
  })

  it('opens the server copy when it is newer, else the device copy', async () => {
    const key = { userId: 'u1', id: 'd-f' }
    localStorage.setItem(
      'pixel-imperium:draft:u1:d-f',
      JSON.stringify({ ...blankDraft(5, 5), title: 'Here', paper: null, updatedAt: '2026-01-02T00:00:00.000Z', unsent: true }),
    )
    const server = { ...blankDraft(5, 5), id: 'd-f', title: 'There', paper: null }
    api.fetchDraftPuzzle.mockResolvedValueOnce({ ...server, updatedAt: '2026-01-03T00:00:00.000Z' })
    expect(await store.openingCopy(key)).toMatchObject({ draft: { title: 'There' }, unsent: false })
    api.fetchDraftPuzzle.mockResolvedValueOnce({ ...server, updatedAt: '2026-01-01T00:00:00.000Z' })
    expect(await store.openingCopy(key)).toMatchObject({ draft: { title: 'Here' }, unsent: true })
  })

  it('starts a draft no one has blank', async () => {
    expect((await store.openingCopy({ userId: 'u1', id: 'd-new' })).draft.cells.every(c => c === null)).toBe(true)
  })

  it('lists the drafts this device keeps for one account', () => {
    store.createDraft('u1', { ...blankDraft(5, 5), title: 'Mine' }, null)
    store.createDraft('u2', { ...blankDraft(5, 5), title: 'Theirs' }, null)
    localStorage.setItem('pixel-imperium:draft:u1:d-broken', '{')
    expect([...store.localDrafts('u1').values()].map(s => s.draft.title)).toEqual(['Mine'])
  })
})
