import { describe, expect, it } from 'vitest'
import { isReserved, isValidHandle, provisionalHandle, slugify } from './handles.ts'

describe('slugify', () => {
  it.each([
    ['Nick Gilliam', 'nick_gilliam'],
    ['  José  Álvarez!! ', 'jose_alvarez'],
    ['ALL_CAPS-name.99', 'all_caps_name_99'],
    ['a-very-long-display-name-indeed', 'a_very_long_display'],
  ])('%j → %j', (name, slug) => {
    expect(slugify(name)).toBe(slug)
  })

  it.each(['', 'Al', '李小龙', '!!!'])('falls back to player for %j', name => {
    expect(slugify(name)).toBe('player')
  })
})

describe('isReserved / isValidHandle', () => {
  it('reserves route words regardless of case', () => {
    expect(isReserved('Admin')).toBe(true)
    expect(isReserved('SETTINGS')).toBe(true)
    expect(isValidHandle('Api')).toBe(false)
  })

  it.each([
    ['nick', true],
    ['Nick_99', true],
    ['ab', false],
    ['a'.repeat(21), false],
    ['no spaces', false],
    ['dash-ed', false],
  ])('%j valid: %s', (handle, valid) => {
    expect(isValidHandle(handle)).toBe(valid)
  })
})

describe('provisionalHandle', () => {
  /** Mimics the database's `lower(handle)` uniqueness. */
  const takenAmong = (...handles: string[]) => {
    const lower = new Set(handles.map(h => h.toLowerCase()))
    return async (h: string) => lower.has(h.toLowerCase())
  }

  it('uses the slug when free', async () => {
    expect(await provisionalHandle('Nick', takenAmong())).toBe('nick')
  })

  it('suffixes the first free number on collision, ignoring case', async () => {
    expect(await provisionalHandle('Nick', takenAmong('NICK', 'nick2'))).toBe('nick3')
  })

  it('trims the base so the suffix stays within 20 characters', async () => {
    const base = 'abcdefghijklmnopqrst'
    expect(await provisionalHandle(base, takenAmong(base))).toBe('abcdefghijklmnopqrs2')
  })

  it('skips reserved names', async () => {
    expect(await provisionalHandle('Admin', takenAmong())).toBe('admin2')
  })
})
