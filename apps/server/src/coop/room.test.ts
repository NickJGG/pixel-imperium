import { describe, expect, it } from 'vitest'
import { parseSeedPuzzle } from '../puzzles.ts'
import { decideAccess } from './access.ts'
import { Room, type SeatHolder } from './room.ts'

const bar = parseSeedPuzzle({ id: 'bar', title: 'Bar', palette: { g: '#0f0' }, rows: ['gg.', '...'] })
const host: SeatHolder & { userId: string } = { identity: 'user:h', userId: 'h', name: 'host' }
const fox: SeatHolder = { identity: 'device:fox-device-token-1', userId: null, name: 'Guest Fox' }
const ada: SeatHolder = { identity: 'user:a', userId: 'a', name: 'ada' }

function room(cells = '......') {
  const r = Room.create({ code: 'abc', host, puzzle: bar, cells, replaying: false, now: 0 })
  r.connect(0)
  return r
}

function seated(r: Room, holder: SeatHolder) {
  const seat = r.take(holder)
  r.connect(seat)
  return seat
}

describe('Room strokes', () => {
  it('applies strokes in arrival order, the later write winning a shared cell', () => {
    const r = room()
    const g = seated(r, fox)
    r.stroke(0, [{ i: 0, to: '#' }])
    r.stroke(g, [{ i: 0, to: 'x' }])
    expect(r.grid).toBe('x.....')
  })

  it('refuses a malformed stroke whole', () => {
    const r = room()
    expect(r.stroke(0, [{ i: 0, to: '#' }, { i: 6, to: '#' }])).toBeNull()
    expect(r.stroke(0, [{ i: 0, to: '?' }])).toBeNull()
    expect(r.stroke(0, [])).toBeNull()
    expect(r.grid).toBe('......')
  })

  it('moves the cursor to the last edit unless the player is pointing', () => {
    const r = room()
    r.stroke(0, [{ i: 0, to: '#' }, { i: 1, to: '#' }])
    expect(r.cursorOf(0)).toBe(1)
    r.point(0, 4)
    expect(r.cursorOf(0)).toBe(4)
    r.point(0, null)
    expect(r.cursorOf(0)).toBe(1)
  })
})

describe('Room undo', () => {
  it("undoes only the player's own latest stroke", () => {
    const r = room()
    const g = seated(r, fox)
    r.stroke(0, [{ i: 3, to: '#' }])
    r.stroke(g, [{ i: 4, to: 'x' }])
    expect(r.undo(0)).toEqual([{ i: 3, to: '.' }])
    expect(r.grid).toBe('....x.')
  })

  it('skips cells someone wrote over since', () => {
    const r = room()
    const g = seated(r, fox)
    r.stroke(0, [{ i: 3, to: '#' }, { i: 4, to: '#' }])
    r.stroke(g, [{ i: 3, to: 'x' }])
    expect(r.undo(0)).toEqual([{ i: 4, to: '.' }])
    expect(r.grid).toBe('...x..')
  })

  it('passes over a stroke wholly written over, to the one before', () => {
    const r = room()
    const g = seated(r, fox)
    r.stroke(0, [{ i: 3, to: '#' }])
    r.stroke(0, [{ i: 4, to: '#' }])
    r.stroke(g, [{ i: 4, to: 'x' }])
    expect(r.undo(0)).toEqual([{ i: 3, to: '.' }])
    expect(r.undo(0)).toEqual([])
  })
})

describe('Room clear', () => {
  it('is for the Host only, and forgets every undo', () => {
    const r = room()
    const g = seated(r, fox)
    r.stroke(g, [{ i: 5, to: '#' }])
    expect(r.clear(g)).toBeNull()
    expect(r.clear(0)).toEqual([{ i: 5, to: '.' }])
    expect(r.undo(g)).toEqual([])
    expect(r.grid).toBe('......')
  })

  it('starts a Replay on a solved grid', () => {
    const r = room()
    r.stroke(0, [{ i: 0, to: '#' }, { i: 1, to: '#' }])
    expect(r.checkSolved()).toBe(true)
    r.clear(0)
    expect(r.solved).toBe(false)
    expect(r.replaying).toBe(true)
  })
})

describe('Room solve', () => {
  it('solves once, then takes no more strokes, undos or hints', () => {
    const r = room()
    r.stroke(0, [{ i: 0, to: '#' }, { i: 1, to: '#' }])
    expect(r.checkSolved()).toBe(true)
    expect(r.checkSolved()).toBe(false)
    expect(r.stroke(0, [{ i: 2, to: '#' }])).toBeNull()
    expect(r.undo(0)).toEqual([])
    expect(r.hint()).toBeNull()
  })

  it('hints against the shared grid', () => {
    const r = room('#.#...')
    expect(r.hint()).toEqual({ kind: 'mistake', index: 2 })
  })
})

describe('Room seats', () => {
  it('gives a returning player their seat back', () => {
    const r = room()
    const g = seated(r, fox)
    r.disconnect(g, 5)
    expect(r.take(fox)).toBe(g)
  })

  it('fills up at four, then lets a newcomer take a gone guest’s seat but never the Host’s', () => {
    const r = room()
    seated(r, fox)
    seated(r, ada)
    const last = seated(r, { identity: 'user:b', userId: 'b', name: 'bo' })
    expect(r.freeSeat()).toBe(-1)
    expect(r.take({ identity: 'user:c', userId: 'c', name: 'cy' })).toBe(-1)
    r.disconnect(0, 1)
    expect(r.take({ identity: 'user:c', userId: 'c', name: 'cy' })).toBe(-1)
    r.disconnect(last, 1)
    expect(r.take({ identity: 'user:c', userId: 'c', name: 'cy' })).toBe(last)
  })

  it('removes a guest for good, leaving their strokes', () => {
    const r = room()
    const g = seated(r, fox)
    r.stroke(g, [{ i: 2, to: '#' }])
    expect(r.remove(g, 0)).toBeNull()
    expect(r.remove(0, g)).toEqual(fox)
    expect(r.isRemoved(fox.identity)).toBe(true)
    expect(r.seatOf(fox.identity)).toBe(-1)
    expect(r.grid).toBe('..#...')
  })

  it('counts as empty once the last connection closes', () => {
    const r = room()
    const g = seated(r, fox)
    r.disconnect(0, 10)
    expect(r.emptySince).toBeNull()
    r.disconnect(g, 20)
    expect(r.emptySince).toBe(20)
  })

  it('keeps holders, grid and removals across a save, but no undo', () => {
    const r = room()
    const g = seated(r, fox)
    r.stroke(g, [{ i: 2, to: '#' }])
    r.remove(0, seated(r, ada))
    r.relink('def')
    const back = new Room({ ...r.save(), puzzle: bar, now: 99 })
    expect(back.state()).toMatchObject({ code: 'def', cells: '..#...', seats: [{ seat: 0 }, { seat: g, name: 'Guest Fox' }] })
    expect(back.previousCodes).toEqual(['abc'])
    expect(back.isRemoved(ada.identity)).toBe(true)
    expect(back.undo(g)).toEqual([])
    expect(back.emptySince).toBe(99)
  })
})

describe('decideAccess', () => {
  const live = { room: 'live', seated: false, removed: false, oldLink: false, seatFree: true, retiredClosed: false } as const

  it('lets a newcomer in by the current link while a seat is free', () => {
    expect(decideAccess(live)).toBe('join')
    expect(decideAccess({ ...live, seatFree: false })).toBe('full')
  })

  it('turns away the removed, even by a seat they held', () => {
    expect(decideAccess({ ...live, removed: true, seated: true })).toBe('removed')
  })

  it('lets a seated player back by a replaced link, but nobody new', () => {
    expect(decideAccess({ ...live, oldLink: true, seated: true })).toBe('join')
    expect(decideAccess({ ...live, oldLink: true })).toBe('ended')
  })

  it('closes a Retired puzzle to newcomers who never started it', () => {
    expect(decideAccess({ ...live, retiredClosed: true })).toBe('retired-closed')
  })

  it('tells an ended co-op from one that never was', () => {
    expect(decideAccess({ ...live, room: 'ended' })).toBe('ended')
    expect(decideAccess({ ...live, room: null })).toBe('not-found')
  })
})
