import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubStorage } from '../test-storage.ts'
import { ProgressStorage, signedOutStorage } from './progress-storage.ts'

describe('ProgressStorage', () => {
  let data: Map<string, string>
  beforeEach(() => (data = stubStorage()))
  afterEach(() => vi.unstubAllGlobals())

  const account = new ProgressStorage('u1')

  it('keeps signed-out keys where they were and namespaces an account', () => {
    signedOutStorage.saveSolved('a', 'local')
    account.saveSolved('a', 'verified')
    expect(data.get('pixel-imperium:solved:a')).toBe('1')
    expect(data.get('pixel-imperium:u:u1:solved:a')).toBe('verified')
  })

  it('round-trips grids with their update time', () => {
    account.saveProgress('a', ['filled', 'marked', 'empty'])
    expect(account.loadCells('a')).toBe('#x.')
    expect(account.loadProgress('a', 3)).toEqual(['filled', 'marked', 'empty'])
    expect(account.loadProgress('a', 4)).toBeNull()
    expect(account.loadUpdatedAt('a')).toMatch(/^\d{4}-\d\d-\d\dT/)
  })

  it('round-trips foil and hint use, both off until saved', () => {
    expect([account.loadFoil('a'), account.loadHinted('a')]).toEqual([false, false])
    account.saveFoil('a', true)
    account.saveHinted('b')
    expect([account.loadFoil('a'), account.loadHinted('b')]).toEqual([true, true])
    expect(signedOutStorage.loadFoil('a')).toBe(false)
    account.saveFoil('a', false)
    expect(account.loadFoil('a')).toBe(false)
  })

  it('round-trips the Attempt time and hint, moving the update time, and clears them', () => {
    expect([account.loadElapsed('a'), account.loadAttemptHinted('a')]).toEqual([0, false])
    account.saveElapsed('a', 4_200, '2026-01-01T00:00:00.000Z')
    expect(account.loadElapsed('a')).toBe(4_200)
    expect(account.loadUpdatedAt('a')).toBe('2026-01-01T00:00:00.000Z')
    account.saveAttemptHinted('a', true, '2026-01-02T00:00:00.000Z')
    expect(account.loadAttemptHinted('a')).toBe(true)
    expect(account.loadUpdatedAt('a')).toBe('2026-01-02T00:00:00.000Z')
    account.clear()
    expect([account.loadElapsed('a'), account.loadAttemptHinted('a')]).toEqual([0, false])
  })

  it('keeps only the lowest best', () => {
    expect(account.loadBest('a')).toBeNull()
    account.saveBest('a', 90_000)
    account.saveBest('a', 120_000)
    expect(account.loadBest('a')).toBe(90_000)
    account.saveBest('a', 45_000)
    expect(account.loadBest('a')).toBe(45_000)
  })

  it('keeps the first solve date, per account, and clears it', () => {
    expect(account.loadSolvedAt('a')).toBeNull()
    account.saveSolvedAt('a', '2026-01-01T00:00:00.000Z')
    account.saveSolvedAt('a', '2026-02-01T00:00:00.000Z')
    expect(account.loadSolvedAt('a')).toBe('2026-01-01T00:00:00.000Z')
    expect(data.get('pixel-imperium:u:u1:solved-at:a')).toBe('2026-01-01T00:00:00.000Z')
    expect(signedOutStorage.loadSolvedAt('a')).toBeNull()
    expect(account.puzzleIds()).toEqual([])
    account.clear()
    expect(account.loadSolvedAt('a')).toBeNull()
  })

  it('round-trips a crest color, per account, and clears it', () => {
    expect(account.loadCrest('a')).toBeNull()
    account.saveCrest('a', '#123456')
    expect(account.loadCrest('a')).toBe('#123456')
    expect(signedOutStorage.loadCrest('a')).toBeNull()
    account.clear()
    expect(account.loadCrest('a')).toBeNull()
  })

  it('round-trips the showcase in order, and keeps it through a clear', () => {
    expect(account.loadShowcase()).toEqual([])
    account.saveShowcase(['b', 'a'])
    account.clear()
    expect(account.loadShowcase()).toEqual(['b', 'a'])
    expect(signedOutStorage.loadShowcase()).toEqual([])
    account.saveShowcase([])
    expect(account.loadShowcase()).toEqual([])
  })

  it('lists a puzzle with only a hint, and clears foil and hints', () => {
    account.saveHinted('a')
    account.saveFoil('b', true)
    expect(account.puzzleIds()).toEqual(['a'])
    account.clear()
    expect([account.loadHinted('a'), account.loadFoil('b')]).toEqual([false, false])
  })

  it('lists and clears only its own puzzles', () => {
    account.saveCells('a', '#', '2026-01-01T00:00:00.000Z')
    account.saveSolved('b', 'unverified')
    account.saveMeta('dirty', '[]')
    signedOutStorage.saveSolved('c', 'local')
    data.set('pixel-imperium:settings', '{}')

    expect(account.puzzleIds().sort()).toEqual(['a', 'b'])
    expect(signedOutStorage.puzzleIds()).toEqual(['c'])

    account.clear()
    expect(account.puzzleIds()).toEqual([])
    expect(account.loadMeta('dirty')).toBe('[]')
    expect(signedOutStorage.loadSolved('c')).toBe('local')
    expect(data.get('pixel-imperium:settings')).toBe('{}')
  })

  it('forgets an account namespace entirely, leaving everything else', () => {
    account.saveCells('a', '#', '2026-01-01T00:00:00.000Z')
    account.saveMeta('dirty', '[]')
    new ProgressStorage('u2').saveSolved('a', 'verified')
    signedOutStorage.saveSolved('c', 'local')

    account.forget()
    expect([...data.keys()].sort()).toEqual(['pixel-imperium:solved:c', 'pixel-imperium:u:u2:solved:a'])
    expect(() => signedOutStorage.forget()).toThrow()
  })

  it('treats a throwing storage as empty', () => {
    vi.stubGlobal('localStorage', {
      get length(): number {
        throw new Error('blocked')
      },
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    })
    account.saveSolved('a', 'local')
    expect(account.loadSolved('a')).toBeNull()
    expect(account.puzzleIds()).toEqual([])
  })
})
