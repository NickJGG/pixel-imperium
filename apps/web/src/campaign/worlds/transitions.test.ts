import { describe, expect, it } from 'vitest'
import { type Env, type Place, transitionFor } from './transitions.ts'

const at = (pathname: string, search: object = {}): Place => ({ pathname, search })

const provinces: Record<string, string> = { p1: '/c/main/meadow', p2: '/c/main/meadow', p9: '/c/main/marsh' }

const desktop: Env = {
  reducedMotion: false,
  phone: false,
  rail: true,
  lessonRail: true,
  direction: 'push',
  uaAnimated: false,
  typed: true,
  edge: false,
  provinceOf: id => provinces[id] ?? null,
}
const phone: Env = { ...desktop, phone: true, rail: false, lessonRail: false }

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
    expect(types(at('/', { open: 'learn' }), '/learn/tutorial')).toEqual(['to-province'])
    expect(types('/learn/techniques', at('/', { open: 'learn' }))).toEqual(['to-home'])
    expect(types('/', '/c/main')).toEqual(['to-province'])
    expect(types('/c/main/', '/', { direction: 'back' })).toEqual(['to-home'])
    expect(types(at('/', { open: 'workshop' }), at('/workshop', { open: 'd-1' }))).toEqual(['to-province'])
    expect(types(at('/workshop', { tab: 'played' }), at('/', { open: 'workshop' }))).toEqual(['to-home'])
  })

  it('opens a province from Campaigns and comes back up, only within its campaign', () => {
    expect(types('/c/main', '/c/main/meadow')).toEqual(['into-album'])
    expect(types('/c/main/meadow', '/c/main/', { direction: 'back' })).toEqual(['out-of-album'])
    expect(types('/c/main/meadow', '/c/main')).toEqual(['out-of-album'])
    expect(types('/c/other', '/c/main/meadow')).toEqual(['wipe'])
  })

  it('steps between pages of one album, and between Home’s columns', () => {
    expect(types('/c/main/meadow', '/c/main/marsh')).toEqual(['step'])
    expect(types('/c/main', '/c/other', { direction: 'replace' })).toEqual(['step'])
    expect(types('/daily/2026/09', '/daily/2026/10', { direction: 'replace' })).toEqual(['step'])
    expect(types(at('/', { open: 'campaign' }), at('/', { open: 'daily' }), { direction: 'replace' })).toEqual(['step'])
    expect(types('/learn/tutorial', '/learn/techniques', { direction: 'replace' })).toEqual(['step'])
    expect(types('/c/main/meadow', '/c/main/marsh', { typed: false })).toEqual([])
  })

  it('steps between the Workshop’s columns and a draft campaign’s provinces', () => {
    const replace = { direction: 'replace' } as const
    expect(types(at('/workshop'), at('/workshop', { open: 'd-1' }), replace)).toEqual(['step'])
    expect(types(at('/workshop', { tab: 'played' }), at('/workshop', { tab: 'played', open: 'c1' }), replace)).toEqual(['step'])
    expect(types(at('/workshop'), at('/workshop', { tab: 'played' }), replace)).toBeNull()
    expect(types('/workshop/c/d-1/1', '/workshop/c/d-1/2', replace)).toEqual(['step'])
    expect(types('/workshop/c/d-1/playtest/1', '/workshop/c/d-1/playtest/2', replace)).toEqual(['step'])
    expect(types('/workshop/c/d-1/1', '/workshop/c/d-1/playtest/1')).toEqual(['wipe'])
  })

  it('slides into another Year', () => {
    expect(types('/daily/2026/01', '/daily/2025/12')).toEqual(['to-year-back'])
    expect(types('/daily/2025/12', '/daily/2026/01')).toEqual(['to-year-forward'])
  })

  it('opens a puzzle from its province page, and goes back', () => {
    expect(types('/c/main/meadow', '/play/p1')).toEqual(['to-board'])
    expect(types('/c/main/meadow/', '/play/p2/', { direction: 'back' })).toEqual(['to-board'])
    expect(types('/play/p1', '/c/main/meadow')).toEqual(['from-board'])
    expect(types('/play/p1', '/c/main/meadow', { direction: 'back' })).toEqual(['from-board'])
  })

  it('wipes between a puzzle and a province page instead, without the rail or out of its province', () => {
    expect(types('/c/main/meadow', '/play/p1', { rail: false })).toEqual(['wipe'])
    expect(types('/play/p1', '/c/main/meadow', { rail: false })).toEqual(['wipe', 'back'])
    expect(types('/play/p1', '/c/main/marsh')).toEqual(['wipe'])
    expect(types('/play/unknown', '/c/main/meadow')).toEqual(['wipe'])
  })

  it('files one puzzle and lifts the next out of its province’s Filmstrip, either way through history', () => {
    expect(types('/play/p1', '/play/p2')).toEqual(['next-board'])
    expect(types('/play/p2/', '/play/p1', { direction: 'back' })).toEqual(['next-board'])
  })

  it('cuts between puzzles without the rail or of different provinces', () => {
    expect(types('/play/p1', '/play/p2', { rail: false })).toBeNull()
    expect(types('/play/p1', '/play/p9')).toBeNull()
    expect(types('/play/p1', '/play/unknown')).toBeNull()
  })

  it('grows a door’s slot into its board, from Home or a Month, and shrinks it home', () => {
    expect(types(at('/', { open: 'campaign' }), '/play/p1')).toEqual(['door-board'])
    expect(types('/', '/daily/2026/10/13', { rail: false })).toEqual(['door-board'])
    expect(types('/daily/2026/10', '/daily/2026/10/13')).toEqual(['door-board'])
    expect(types('/daily/2026/10', '/daily/2026/09/30/')).toEqual(['door-board'])
    expect(types('/play/p1', '/', { direction: 'back' })).toEqual(['door-back'])
    expect(types('/daily/2026/10/13', '/daily/2026/10')).toEqual(['door-back'])
    expect(types('/daily/2026/10/13', at('/', { open: 'daily' }), { direction: 'back' })).toEqual(['door-back'])
  })

  it('only grows the slot into its board on a phone, a province’s too, and wipes the rest of a board’s moves', () => {
    expect(types('/', '/play/p1', phone)).toEqual(['grow-board'])
    expect(types('/daily/2026/10', '/daily/2026/10/13', phone)).toEqual(['grow-board'])
    expect(types('/c/main/meadow', '/play/p1', phone)).toEqual(['grow-board'])
    expect(types('/play/p1', '/c/main/meadow', phone)).toEqual(['grow-back'])
    expect(types('/daily/2026/10/13', '/', { ...phone, direction: 'back' })).toEqual(['grow-back'])
    expect(types('/play/p1', '/play/p2', phone)).toEqual(['wipe'])
    expect(types('/play/p1', '/c/main/marsh', phone)).toEqual(['wipe'])
    expect(types('/c/main/meadow', '/learn/tutorial/first', phone)).toEqual(['wipe'])
    expect(types('/play/p1', '/', { ...phone, direction: 'back', uaAnimated: true })).toBeNull()
  })

  it('opens a Lesson from its track as a puzzle from its province, and steps between Lessons', () => {
    expect(types('/learn/tutorial', '/learn/tutorial/overlap')).toEqual(['to-board'])
    expect(types('/learn/tutorial/overlap', '/learn/tutorial')).toEqual(['from-board'])
    expect(types('/learn/tutorial/overlap/', '/learn/tutorial/putting-it-together')).toEqual(['next-board'])
    expect(types('/learn/tutorial/overlap', '/learn/techniques/edges')).toBeNull()
    expect(types('/learn/techniques', '/learn/tutorial/overlap')).toEqual(['wipe'])
  })

  it('goes by a Lesson’s own rail, not Play’s', () => {
    expect(types('/learn/tutorial', '/learn/tutorial/overlap', { rail: false })).toEqual(['to-board'])
    expect(types('/learn/tutorial', '/learn/tutorial/overlap', { lessonRail: false })).toEqual(['wipe'])
    expect(types('/learn/tutorial/overlap', '/learn/tutorial', { lessonRail: false })).toEqual(['wipe', 'back'])
    expect(types('/learn/tutorial/overlap', '/learn/tutorial/putting-it-together', { lessonRail: false })).toBeNull()
  })

  it('grows a Lesson from Home’s Learn column, or from a track’s offer over a puzzle, and shrinks it home', () => {
    expect(types(at('/', { open: 'learn' }), '/learn/tutorial/overlap')).toEqual(['door-board'])
    expect(types('/learn/tutorial/overlap', at('/', { open: 'learn' }))).toEqual(['door-back'])
    expect(types('/play/p1', '/learn/tutorial/reading-clues')).toEqual(['door-board', 'over-board'])
    expect(types('/learn/tutorial/reading-clues', '/play/p1')).toEqual(['door-back', 'over-board'])
    expect(types('/play/p1', '/learn/tutorial/reading-clues', phone)).toEqual(['grow-board'])
    expect(types('/learn/tutorial', '/learn/tutorial/overlap', phone)).toEqual(['grow-board'])
    expect(types('/learn/tutorial/overlap', '/learn/tutorial', phone)).toEqual(['grow-back'])
    expect(types('/learn/tutorial/overlap', '/learn/tutorial/putting-it-together', phone)).toEqual(['wipe'])
  })

  it('plays none of them on a phone', () => {
    expect(types('/c/main/meadow', '/c/main/marsh', phone)).toBeNull()
    expect(types('/learn/tutorial', '/learn/techniques', { ...phone, direction: 'replace' })).toBeNull()
    expect(types('/', '/learn/tutorial', phone)).toEqual(['wipe'])
    expect(types(at('/', { open: 'campaign' }), at('/', { open: 'daily' }), phone)).toBeNull()
    expect(types('/', '/c/main/meadow', phone)).toEqual(['wipe'])
    expect(types('/c/main', '/c/other', { ...phone, direction: 'replace' })).toBeNull()
    expect(types('/daily/2026/01', '/daily/2025/12', phone)).toEqual(['wipe'])
  })
})

describe('transitionFor: the wipe', () => {
  it('wipes between plain pages, and reverses on Back', () => {
    expect(types('/', '/settings')).toEqual(['wipe'])
    expect(types('/settings', '/u/ada')).toEqual(['wipe'])
    expect(types('/u/ada', '/settings', { direction: 'back' })).toEqual(['wipe', 'back'])
  })

  it('wipes out to Home and in from it, whichever way history went', () => {
    expect(types('/settings', '/')).toEqual(['wipe', 'back'])
    expect(types('/u/ada', '/', { direction: 'back' })).toEqual(['wipe', 'back'])
    expect(types('/', '/u/ada', { direction: 'back' })).toEqual(['wipe'])
  })

  it('wipes out from a province up to Campaigns, and in from it, on a phone', () => {
    expect(types('/c/main/meadow', '/c/main', phone)).toEqual(['wipe', 'back'])
    expect(types('/c/main', '/c/main/meadow', { ...phone, direction: 'back' })).toEqual(['wipe'])
    expect(types('/c/main', '/c/main/meadow', phone)).toEqual(['wipe'])
  })

  it('wipes on a phone too', () => {
    expect(types('/settings', '/u/ada', phone)).toEqual(['wipe'])
    expect(types('/u/ada', '/settings', { ...phone, direction: 'back' })).toEqual(['wipe', 'back'])
  })

  it('wipes between albums that don’t morph', () => {
    expect(types('/c/main/meadow', '/c/other/meadow')).toEqual(['wipe'])
    expect(types('/c/main/meadow', '/learn/techniques')).toEqual(['wipe'])
  })

  it('cuts on a replace', () => {
    expect(types('/', '/settings', { direction: 'replace' })).toBeNull()
  })

  it('cuts a change of search on one page, like Profile’s album switch', () => {
    expect(types(at('/u/ada', { c: 'main' }), at('/u/ada', { c: 'year-2026' }))).toBeNull()
  })

  it('leaves boards and redirects to cut', () => {
    for (const board of ['/daily/2026/10/13', '/learn/tutorial/first'])
      for (const [from, to] of [
        ['/c/main/meadow', board],
        [board, '/c/main/meadow'],
      ] as const)
        expect(types(from, to)).toBeNull()
    expect(types('/play/p1', '/settings')).toBeNull()
    expect(types('/', '/c')).toBeNull()
    expect(types('/', '/learn')).toBeNull()
    expect(types('/', '/u/ada/main/meadow')).toBeNull()
  })

  it('out of an edge state, which has no board or column to morph', () => {
    expect(types('/daily/2026/10/11', '/', { edge: true })).toEqual(['wipe', 'back'])
    expect(types('/play/p1', '/c/main/meadow', { edge: true })).toEqual(['wipe', 'back'])
    expect(types('/c/main/atlantis', '/', { edge: true })).toEqual(['wipe', 'back'])
    expect(types('/play/nope', '/settings', { edge: true })).toEqual(['wipe'])
    expect(types('/play/nope', '/settings', { ...phone, edge: true })).toEqual(['wipe'])
  })
})

describe('transitionFor: when nothing plays', () => {
  it('under reduced motion', () => {
    expect(types('/', '/c/main/meadow', { reducedMotion: true })).toBeNull()
    expect(types('/c/main/meadow', '/c/main/marsh', { reducedMotion: true })).toBeNull()
    expect(types('/c/main/meadow', '/play/p1', { reducedMotion: true })).toBeNull()
    expect(types('/play/p1', '/play/p2', { reducedMotion: true })).toBeNull()
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
