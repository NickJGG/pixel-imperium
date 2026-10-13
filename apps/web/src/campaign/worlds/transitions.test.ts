import { describe, expect, it } from 'vitest'
import { type Env, type Place, transitionFor } from './transitions.ts'

const at = (pathname: string, search: object = {}): Place => ({ pathname, search })

const desktop: Env = { reducedMotion: false, phone: false, rail: true, direction: 'push', uaAnimated: false, typed: true }
const phone: Env = { ...desktop, phone: true, rail: false }

const types = (from: string | Place, to: string | Place, env: Partial<Env> = {}) => {
  const place = (p: string | Place) => (typeof p === 'string' ? at(p) : p)
  return transitionFor(place(from), place(to), { ...desktop, ...env })?.types ?? null
}

describe('transitionFor: the morphs', () => {
  it('opens an album page from Home and comes back', () => {
    expect(types('/', '/c/main/meadow')).toEqual(['to-province'])
    expect(types('/c/main/meadow', '/', { direction: 'back' })).toEqual(['to-home'])
    expect(types('/', '/daily/2026/10')).toEqual(['to-province'])
    expect(types('/daily/2026/10', '/')).toEqual(['to-home'])
  })

  it('steps between pages of one album, and between Home’s columns', () => {
    expect(types('/c/main/meadow', '/c/main/marsh')).toEqual([])
    expect(types('/daily/2026/09', '/daily/2026/10', { direction: 'replace' })).toEqual([])
    expect(types(at('/', { open: 'campaign' }), at('/', { open: 'daily' }), { direction: 'replace' })).toEqual([])
  })

  it('slides into another Year', () => {
    expect(types('/daily/2026/01', '/daily/2025/12')).toEqual(['to-year-back'])
    expect(types('/daily/2025/12', '/daily/2026/01')).toEqual(['to-year-forward'])
  })

  it('plays none of them on a phone', () => {
    expect(types('/c/main/meadow', '/c/main/marsh', phone)).toBeNull()
    expect(types(at('/', { open: 'campaign' }), at('/', { open: 'daily' }), phone)).toBeNull()
    expect(types('/', '/c/main/meadow', phone)).toEqual(['wipe'])
    expect(types('/daily/2026/01', '/daily/2025/12', phone)).toEqual(['wipe'])
  })
})

describe('transitionFor: the wipe', () => {
  it('wipes between plain pages, and reverses on Back', () => {
    expect(types('/', '/settings')).toEqual(['wipe'])
    expect(types('/settings', '/u/ada')).toEqual(['wipe'])
    expect(types('/u/ada', '/settings', { direction: 'back' })).toEqual(['wipe', 'back'])
    expect(types('/', '/learn')).toEqual(['wipe'])
  })

  it('wipes out to Home and in from it, whichever way history went', () => {
    expect(types('/settings', '/')).toEqual(['wipe', 'back'])
    expect(types('/u/ada', '/', { direction: 'back' })).toEqual(['wipe', 'back'])
    expect(types('/', '/u/ada', { direction: 'back' })).toEqual(['wipe'])
  })

  it('wipes on a phone too', () => {
    expect(types('/settings', '/u/ada', phone)).toEqual(['wipe'])
    expect(types('/u/ada', '/settings', { ...phone, direction: 'back' })).toEqual(['wipe', 'back'])
  })

  it('wipes between albums that don’t morph', () => {
    expect(types('/c/main/meadow', '/c/other/meadow')).toEqual(['wipe'])
  })

  it('cuts on a replace', () => {
    expect(types('/', '/settings', { direction: 'replace' })).toBeNull()
  })

  it('cuts a change of search on one page, like Profile’s album switch', () => {
    expect(types(at('/u/ada', { c: 'main' }), at('/u/ada', { c: 'year-2026' }))).toBeNull()
  })

  it('leaves boards and redirects to cut', () => {
    for (const board of ['/play/p1', '/daily/2026/10/13', '/learn/tutorial/first'])
      for (const [from, to] of [
        ['/c/main/meadow', board],
        [board, '/c/main/meadow'],
      ] as const)
        expect(types(from, to)).toBeNull()
    expect(types('/', '/c/main')).toBeNull()
    expect(types('/', '/learn/techniques')).toBeNull()
    expect(types('/', '/u/ada/main/meadow')).toBeNull()
  })
})

describe('transitionFor: when nothing plays', () => {
  it('under reduced motion', () => {
    expect(types('/', '/c/main/meadow', { reducedMotion: true })).toBeNull()
    expect(types('/c/main/meadow', '/c/main/marsh', { reducedMotion: true })).toBeNull()
    expect(types('/', '/settings', { reducedMotion: true })).toBeNull()
  })

  it('when the browser already animated the move', () => {
    expect(types('/u/ada', '/settings', { ...phone, direction: 'back', uaAnimated: true })).toBeNull()
    expect(types('/c/main/meadow', '/', { direction: 'back', uaAnimated: true })).toBeNull()
  })

  it('without transition types, except an untyped step', () => {
    expect(types('/', '/settings', { typed: false })).toBeNull()
    expect(types('/', '/c/main/meadow', { typed: false })).toBeNull()
    expect(types('/c/main/meadow', '/c/main/marsh', { typed: false })).toEqual([])
  })
})
