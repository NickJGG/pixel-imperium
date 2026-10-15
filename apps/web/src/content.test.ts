import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { campaign, dailyYear, forgetOwnProfile, ownProfile, puzzle, resetContent, solve } from './content.ts'

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

describe('content', () => {
  let fetch: ReturnType<typeof vi.fn<(url: string, init?: RequestInit) => Promise<Response>>>
  beforeEach(() => {
    resetContent()
    fetch = vi.fn(async () => json({ id: 'x' }))
    vi.stubGlobal('fetch', fetch)
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('shares one request between concurrent loads, and keeps the result', async () => {
    const [a, b] = await Promise.all([campaign('c1'), campaign('c1')])
    expect(a).toBe(b)
    await campaign('c1')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('drops a failed load, so the next one retries', async () => {
    fetch.mockResolvedValueOnce(json({}, 500))
    await expect(puzzle('p1')).rejects.toThrow('500')
    expect(await puzzle('p1')).toEqual({ id: 'x' })
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps a missing puzzle as missing', async () => {
    fetch.mockResolvedValueOnce(json({}, 404))
    expect(await puzzle('nope')).toBeNull()
    expect(await puzzle('nope')).toBeNull()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refetches a Year once the day turns over at UTC+14', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-15T09:59:00Z'))
    await dailyYear(2026)
    vi.setSystemTime(new Date('2026-10-15T09:59:59Z'))
    await dailyYear(2026)
    expect(fetch).toHaveBeenCalledTimes(1)
    vi.setSystemTime(new Date('2026-10-15T10:00:00Z'))
    await dailyYear(2026)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('refetches the own profile once forgotten, as a solve does', async () => {
    await ownProfile('ada')
    await ownProfile('ada')
    expect(fetch).toHaveBeenCalledTimes(1)
    forgetOwnProfile()
    await ownProfile('ada')
    expect(fetch).toHaveBeenCalledTimes(2)
    await solve('p1', { cells: '' } as never)
    await ownProfile('ada')
    expect(fetch).toHaveBeenCalledTimes(4)
  })
})
