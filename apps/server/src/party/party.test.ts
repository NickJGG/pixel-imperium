import { describe, expect, it } from 'vitest'
import { parseSeedPuzzle } from '../puzzles.ts'
import { decideAccess } from './access.ts'
import { Grid } from './grid.ts'
import { HOST_GRACE_MS, Party, type SeatHolder } from './party.ts'

const bar = parseSeedPuzzle({ id: 'bar', title: 'Bar', palette: { g: '#0f0' }, rows: ['gg.', '...'] })
const host: SeatHolder & { userId: string } = { identity: 'user:h', userId: 'h', name: 'host' }
const fox: SeatHolder = { identity: 'device:fox-device-token-1', userId: null, name: 'Guest Fox' }
const ada: SeatHolder = { identity: 'user:a', userId: 'a', name: 'ada' }
const bo: SeatHolder = { identity: 'user:b', userId: 'b', name: 'bo' }

const grid = (cells = '......') => new Grid({ puzzle: bar, ownerId: 'h', cells, replaying: false })

function party(withGrid = true) {
  const p = Party.create({ code: 'abc', host, now: 0 })
  p.connect(0)
  if (withGrid) p.grid = grid()
  return p
}

function seated(p: Party, holder: SeatHolder, now = 0) {
  const seat = p.take(holder, now)
  p.connect(seat)
  return seat
}

describe('Grid strokes', () => {
  it('applies strokes in arrival order, the later write winning a shared cell', () => {
    const g = grid()
    g.stroke(0, [{ i: 0, to: '#' }])
    g.stroke(1, [{ i: 0, to: 'x' }])
    expect(g.text).toBe('x.....')
  })

  it('refuses a malformed stroke whole', () => {
    const g = grid()
    expect(g.stroke(0, [{ i: 0, to: '#' }, { i: 6, to: '#' }])).toBeNull()
    expect(g.stroke(0, [{ i: 0, to: '?' }])).toBeNull()
    expect(g.stroke(0, [])).toBeNull()
    expect(g.text).toBe('......')
  })

  it('moves the cursor to the last edit unless the player is pointing', () => {
    const g = grid()
    g.stroke(0, [{ i: 0, to: '#' }, { i: 1, to: '#' }])
    expect(g.cursorOf(0)).toBe(1)
    g.point(0, 4)
    expect(g.cursorOf(0)).toBe(4)
    g.point(0, null)
    expect(g.cursorOf(0)).toBe(1)
  })
})

describe('Grid undo', () => {
  it("undoes only the player's own latest stroke", () => {
    const g = grid()
    g.stroke(0, [{ i: 3, to: '#' }])
    g.stroke(1, [{ i: 4, to: 'x' }])
    expect(g.undo(0)).toEqual([{ i: 3, to: '.' }])
    expect(g.text).toBe('....x.')
  })

  it('skips cells someone wrote over since', () => {
    const g = grid()
    g.stroke(0, [{ i: 3, to: '#' }, { i: 4, to: '#' }])
    g.stroke(1, [{ i: 3, to: 'x' }])
    expect(g.undo(0)).toEqual([{ i: 4, to: '.' }])
    expect(g.text).toBe('...x..')
  })

  it('passes over a stroke wholly written over, to the one before', () => {
    const g = grid()
    g.stroke(0, [{ i: 3, to: '#' }])
    g.stroke(0, [{ i: 4, to: '#' }])
    g.stroke(1, [{ i: 4, to: 'x' }])
    expect(g.undo(0)).toEqual([{ i: 3, to: '.' }])
    expect(g.undo(0)).toEqual([])
  })

  it('undoes a stroke sent in pieces as one', () => {
    const g = grid()
    g.stroke(0, [{ i: 0, to: '#' }])
    g.stroke(0, [{ i: 0, to: '#' }], false)
    g.stroke(0, [{ i: 1, to: '#' }], true)
    g.stroke(0, [{ i: 2, to: '#' }], true)
    expect(g.undo(0)).toEqual([
      { i: 2, to: '.' },
      { i: 1, to: '.' },
    ])
    expect(g.text).toBe('#.....')
  })

  it('starts afresh on a piece whose stroke is no longer the latest, as after a Clear', () => {
    const g = grid()
    g.stroke(0, [{ i: 0, to: '#' }])
    g.clear()
    g.stroke(0, [{ i: 1, to: '#' }], true)
    expect(g.undo(0)).toEqual([{ i: 1, to: '.' }])
    expect(g.undo(0)).toEqual([])
  })
})

describe('Grid cancel', () => {
  it('takes back the stroke being drawn, but no stroke before it', () => {
    const g = grid()
    g.stroke(0, [{ i: 0, to: '#' }])
    g.stroke(0, [{ i: 3, to: 'x' }])
    g.stroke(0, [{ i: 4, to: 'x' }], true)
    g.stroke(1, [{ i: 4, to: '#' }])
    expect(g.cancel(0)).toEqual([{ i: 3, to: '.' }])
    expect(g.text).toBe('#...#.')
    expect(g.cancel(0)).toEqual([])
    expect(g.undo(0)).toEqual([{ i: 0, to: '.' }])
  })
})

describe('Grid solve', () => {
  it('solves once, then takes no more strokes, undos or hints', () => {
    const g = grid()
    g.stroke(0, [{ i: 0, to: '#' }, { i: 1, to: '#' }])
    expect(g.checkSolved()).toBe(true)
    expect(g.checkSolved()).toBe(false)
    expect(g.stroke(0, [{ i: 2, to: '#' }])).toBeNull()
    expect(g.undo(0)).toEqual([])
    expect(g.hint()).toBeNull()
  })

  it('hints against the shared grid', () => {
    expect(grid('#.#...').hint()).toEqual({ kind: 'mistake', index: 2 })
  })

  it('starts a Replay on Clear of a solved grid', () => {
    const g = grid()
    g.stroke(0, [{ i: 0, to: '#' }, { i: 1, to: '#' }])
    g.checkSolved()
    g.clear()
    expect(g.solved).toBe(false)
    expect(g.replaying).toBe(true)
  })
})

describe('Party clear', () => {
  it('is for the Host only, and forgets every undo', () => {
    const p = party()
    const g = seated(p, fox)
    p.grid!.stroke(g, [{ i: 5, to: '#' }])
    expect(p.clear(g)).toBeNull()
    expect(p.clear(0)).toEqual([{ i: 5, to: '.' }])
    expect(p.grid!.undo(g)).toEqual([])
    expect(p.grid!.text).toBe('......')
  })

  it('follows the Host when it passes', () => {
    const p = party()
    const a = seated(p, ada)
    p.makeHost(0, a)
    expect(p.clear(0)).toBeNull()
    expect(p.clear(a)).toEqual([])
  })
})

describe('Party seats', () => {
  it('gives a returning player their seat back', () => {
    const p = party()
    const g = seated(p, fox)
    p.disconnect(g, 5)
    expect(p.take(fox, 6)).toBe(g)
  })

  it('fills up at four, then lets a newcomer take a gone member’s seat but never the Host’s', () => {
    const p = party()
    seated(p, fox)
    seated(p, ada)
    const last = seated(p, bo)
    const cy: SeatHolder = { identity: 'user:c', userId: 'c', name: 'cy' }
    expect(p.freeSeat()).toBe(-1)
    expect(p.take(cy, 1)).toBe(-1)
    p.disconnect(0, 1)
    expect(p.take(cy, 1)).toBe(-1)
    p.disconnect(last, 1)
    expect(p.take(cy, 1)).toBe(last)
  })

  it('forgets a taken-over seat’s undo', () => {
    const p = party()
    const b = seated(p, bo)
    p.grid!.stroke(b, [{ i: 2, to: '#' }])
    seated(p, fox)
    seated(p, ada)
    p.disconnect(b, 1)
    expect(p.take({ identity: 'user:c', userId: 'c', name: 'cy' }, 1)).toBe(b)
    expect(p.grid!.undo(b)).toEqual([])
  })

  it('removes a member for good, leaving their strokes', () => {
    const p = party()
    const g = seated(p, fox)
    p.grid!.stroke(g, [{ i: 2, to: '#' }])
    expect(p.remove(g, 0)).toBeNull()
    expect(p.remove(0, g)).toEqual(fox)
    expect(p.isRemoved(fox.identity)).toBe(true)
    expect(p.seatOf(fox.identity)).toBe(-1)
    expect(p.grid!.text).toBe('..#...')
  })

  it('counts as empty once the last connection closes', () => {
    const p = party()
    const g = seated(p, fox)
    p.disconnect(0, 10)
    expect(p.emptySince).toBeNull()
    p.disconnect(g, 20)
    expect(p.emptySince).toBe(20)
  })

  it('shows a member Away while connected but not on the grid’s page, with no cursor', () => {
    const p = party()
    const a = seated(p, ada)
    p.setHere(0, 1)
    p.grid!.stroke(0, [{ i: 3, to: '#' }])
    p.grid!.stroke(a, [{ i: 4, to: '#' }])
    expect(p.seatList()).toEqual([
      { seat: 0, name: 'host', account: true, connected: true, here: true, cursor: 3 },
      { seat: a, name: 'ada', account: true, connected: true, here: false, cursor: null },
    ])
  })

  it('names its puzzle while it has a grid', () => {
    expect(party(false).state().puzzle).toBeNull()
    expect(party().state()).toMatchObject({ code: 'abc', host: 0, puzzle: { id: 'bar', title: 'Bar' } })
  })
})

describe('Party Host', () => {
  it('passes on leaving to the longest-seated connected signed-in member', () => {
    const p = party()
    const b = seated(p, bo)
    seated(p, fox)
    const a = seated(p, ada)
    p.disconnect(b, 1)
    expect(p.leave(0, 2)).toEqual({ host: a, hostless: false })
    expect(p.hostSeat).toBe(a)
    expect(p.seatOf(host.identity)).toBe(-1)
  })

  it('passes on leaving to a disconnected signed-in member when none is connected', () => {
    const p = party()
    const b = seated(p, bo)
    seated(p, fox)
    p.disconnect(b, 1)
    expect(p.leave(0, 2)).toEqual({ host: b, hostless: false })
  })

  it('is hostless once the Host leaves with no signed-in member to take over', () => {
    const p = party()
    seated(p, fox)
    expect(p.leave(0, 2)).toEqual({ host: null, hostless: true })
  })

  it('stays when a member who isn’t Host leaves', () => {
    const p = party()
    const a = seated(p, ada)
    expect(p.leave(a, 2)).toEqual({ host: null, hostless: false })
    expect(p.size).toBe(1)
  })

  it('passes a Host gone past the grace, and not before', () => {
    const p = party()
    seated(p, fox)
    const b = seated(p, bo)
    const a = seated(p, ada)
    p.disconnect(b, 0)
    p.disconnect(0, 100)
    expect(p.passHost(100 + HOST_GRACE_MS - 1)).toBe(-1)
    expect(p.passHost(100 + HOST_GRACE_MS)).toBe(a)
    expect(p.hostSeat).toBe(a)
  })

  it('stays with a gone Host while no signed-in member is connected', () => {
    const p = party()
    seated(p, fox)
    p.disconnect(0, 0)
    expect(p.passHost(HOST_GRACE_MS)).toBe(-1)
    expect(p.hostSeat).toBe(0)
  })

  it('hands over by Make Host, to signed-in members only, by the Host only', () => {
    const p = party()
    const g = seated(p, fox)
    const a = seated(p, ada)
    expect(p.makeHost(0, g)).toBe(false)
    expect(p.makeHost(a, a)).toBe(false)
    expect(p.makeHost(0, a)).toBe(true)
    expect(p.hostSeat).toBe(a)
    expect(p.remove(0, a)).toBeNull()
  })

  it('keeps holders, join order, Host, grid and removals across a save, but no undo', () => {
    const p = party()
    const g = seated(p, fox)
    const a = seated(p, ada)
    p.grid!.stroke(g, [{ i: 2, to: '#' }])
    p.remove(0, seated(p, bo))
    p.makeHost(0, a)
    p.relink('def')
    const saved = p.save()
    const back = new Party({ ...saved, grid: new Grid({ ...saved.grid!, puzzle: bar }), now: 99 })
    expect(back.state()).toMatchObject({ code: 'def', host: a, seats: [{ seat: 0 }, { seat: g, name: 'Guest Fox' }, { seat: a }] })
    expect(back.grid!.text).toBe('..#...')
    expect(back.previousCodes).toEqual(['abc'])
    expect(back.isRemoved(bo.identity)).toBe(true)
    expect(back.grid!.undo(g)).toEqual([])
    expect(back.emptySince).toBe(99)
    back.connect(a)
    expect(back.leave(a, 100).host).toBe(0)
  })
})

describe('decideAccess', () => {
  const live = { party: 'live', seated: false, removed: false, invited: false, oldLink: false, seatFree: true, retiredClosed: false } as const

  it('lets a newcomer in by the current link while a seat is free', () => {
    expect(decideAccess(live)).toBe('join')
    expect(decideAccess({ ...live, seatFree: false })).toBe('full')
  })

  it('turns away the removed, even by a seat they held or a friend’s invite', () => {
    expect(decideAccess({ ...live, removed: true, seated: true })).toBe('removed')
    expect(decideAccess({ ...live, removed: true, invited: true })).toBe('removed')
  })

  it('lets a seated player back by a replaced link, but nobody new', () => {
    expect(decideAccess({ ...live, oldLink: true, seated: true })).toBe('join')
    expect(decideAccess({ ...live, oldLink: true })).toBe('ended')
  })

  it('lets an invite in without the current link', () => {
    expect(decideAccess({ ...live, invited: true, oldLink: true })).toBe('join')
  })

  it('closes a Retired puzzle to newcomers who never started it', () => {
    expect(decideAccess({ ...live, retiredClosed: true })).toBe('retired-closed')
  })

  it('tells an ended Party from one that never was', () => {
    expect(decideAccess({ ...live, party: 'ended' })).toBe('ended')
    expect(decideAccess({ ...live, party: null })).toBe('not-found')
  })
})
