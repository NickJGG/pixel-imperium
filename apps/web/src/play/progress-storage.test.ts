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
