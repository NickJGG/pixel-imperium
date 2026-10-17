import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cluesFromSolution } from '@pixel-imperium/nonogram'
import type { CoopSeat, CoopServerMsg } from '@pixel-imperium/protocol'
import { stubStorage } from '../test-storage.ts'
import { PlayStore } from '../play/store.ts'
import { CoopStorage } from './coop-storage.ts'
import { fakeSockets } from './fake-socket.ts'
import { CoopSession } from './session.ts'

// 2×2, top row filled.
const solution = [true, true, false, false]
const seat = (n: number, name: string, cursor: number | null = null): CoopSeat => ({
  seat: n,
  name,
  account: n === 0,
  connected: true,
  cursor,
})
const snapshot = (cells: string): CoopServerMsg => ({
  type: 'snapshot',
  room: { code: 'abc', puzzleId: 'p', cells, seats: [seat(0, 'nick'), seat(1, 'Guest Fox')], solved: false },
  you: 1,
})

describe('CoopSession', () => {
  beforeEach(() => {
    stubStorage()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function join(cells = '....') {
    const sockets = fakeSockets()
    let t = 0
    const session = new CoopSession('abc', { deviceToken: 'device-token-0123', now: () => t, socket: { create: sockets.create, url: 'ws://test/ws' } })
    session.start()
    sockets.latest().open()
    sockets.latest().receive(snapshot(cells))
    const store = new PlayStore(
      { id: 'p', width: 2, height: 2, clues: cluesFromSolution(2, 2, solution) },
      { storage: new CoopStorage(null, () => session.grid(), false), coop: session },
    )
    const unbind = session.bind(store)
    const ws = () => sockets.latest()
    const sent = (type: string) => ws().sent.filter(m => m.type === type)
    return { session, store, ws, sent, unbind, sockets, tick: (ms: number) => (t += ms) }
  }

  const grid = (store: PlayStore) => store.getState().cells.map(c => ({ empty: '.', filled: '#', marked: 'x' })[c]).join('')

  it('opens on the snapshot', () => {
    const { store } = join('#...')
    expect(grid(store)).toBe('#...')
  })

  it("keeps its own stroke on top until the server's echo settles it", () => {
    const { store, ws, sent } = join()
    store.beginStroke({ row: 0, col: 0 }, 'fill', { lockAxis: false })
    store.endStroke()
    expect(sent('stroke')).toEqual([{ type: 'stroke', id: 1, changes: [{ i: 0, to: '#' }] }])
    // A partner's earlier stroke over the same cell, then ours: ours applied last, so it stays.
    ws().receive({ type: 'stroke', id: 7, by: 0, changes: [{ i: 0, to: 'x' }] })
    expect(grid(store)).toBe('#...')
    ws().receive({ type: 'stroke', id: 1, by: 1, changes: [{ i: 0, to: '#' }] })
    expect(grid(store)).toBe('#...')
    // A partner's later stroke now wins.
    ws().receive({ type: 'stroke', id: 8, by: 0, changes: [{ i: 0, to: 'x' }] })
    expect(grid(store)).toBe('x...')
  })

  it('shows an undo only once the server has made it', () => {
    const { store, ws, sent } = join()
    store.beginStroke({ row: 1, col: 1 }, 'mark', { lockAxis: false })
    store.endStroke()
    ws().receive({ type: 'stroke', id: 1, by: 1, changes: [{ i: 3, to: 'x' }] })
    store.undo()
    expect(sent('undo')).toHaveLength(1)
    expect(grid(store)).toBe('...x')
    ws().receive({ type: 'stroke', id: null, by: 1, changes: [{ i: 3, to: '.' }] })
    expect(grid(store)).toBe('....')
  })

  it('takes a reconnect snapshot as the truth, and sends strokes drawn while away after it', () => {
    const { store, ws, sockets } = join()
    store.beginStroke({ row: 0, col: 0 }, 'fill', { lockAxis: false })
    store.endStroke()
    ws().drop()
    store.beginStroke({ row: 1, col: 0 }, 'mark', { lockAxis: false })
    store.endStroke()
    expect(grid(store)).toBe('#.x.')
    vi.runOnlyPendingTimers()
    expect(sockets.made).toHaveLength(2)
    ws().open()
    ws().receive(snapshot('.#..'))
    // The first stroke never reached the server; the one drawn while away goes out now.
    expect(grid(store)).toBe('.#x.')
    expect(ws().sent.filter(m => m.type === 'stroke')).toEqual([{ type: 'stroke', id: 2, changes: [{ i: 2, to: 'x' }] }])
  })

  it('sends a drag in pieces, and cancels only what went out', () => {
    const { store, ws, sent } = join()
    store.beginStroke({ row: 0, col: 0 }, 'fill', { lockAxis: false })
    store.extendStroke({ row: 0, col: 1 })
    ws().drop()
    store.extendStroke({ row: 1, col: 1 })
    expect(sent('stroke')).toEqual([
      {
        type: 'stroke',
        id: 1,
        changes: [
          { i: 0, to: '#' },
          { i: 1, to: '#' },
        ],
      },
    ])
    store.cancelStroke()
    // Back online, the piece drawn while away stays unsent.
    vi.runOnlyPendingTimers()
    ws().open()
    ws().receive(snapshot('##..'))
    expect(ws().sent.filter(m => m.type === 'stroke')).toEqual([])
    expect(grid(store)).toBe('##..')
  })

  it('cancels a stroke whose pieces went out', () => {
    const { store, ws, sent } = join()
    store.beginStroke({ row: 1, col: 0 }, 'mark', { lockAxis: false })
    store.extendStroke({ row: 1, col: 1 })
    store.cancelStroke()
    expect(sent('cancel')).toHaveLength(1)
    ws().receive({ type: 'stroke', id: 1, by: 1, changes: [{ i: 2, to: 'x' }, { i: 3, to: 'x' }] })
    ws().receive({ type: 'stroke', id: null, by: 1, changes: [{ i: 3, to: '.' }, { i: 2, to: '.' }] })
    expect(grid(store)).toBe('....')
  })

  it('lets go of a drag the server solved partway through', () => {
    const { store, ws } = join()
    store.beginStroke({ row: 0, col: 0 }, 'fill', { lockAxis: false })
    store.extendStroke({ row: 0, col: 1 })
    ws().receive({ type: 'stroke', id: 1, by: 1, changes: [{ i: 0, to: '#' }, { i: 1, to: '#' }] })
    store.extendStroke({ row: 1, col: 1 })
    ws().receive({ type: 'solved', palette: ['#f00', '#0f0', null, null], foil: false })
    store.endStroke()
    expect(grid(store)).toBe('##..')
    expect(store.getState()).toMatchObject({ solved: true, palette: ['#f00', '#0f0', null, null] })
  })

  it('solves on a partner stroke and takes the reveal from the server', () => {
    const { store, ws } = join('#...')
    ws().receive({ type: 'stroke', id: 3, by: 0, changes: [{ i: 1, to: '#' }] })
    expect(store.getState().solved).toBe(true)
    ws().receive({ type: 'solved', palette: ['#f00', '#0f0', null, null], foil: false })
    expect(store.getState().palette).toEqual(['#f00', '#0f0', null, null])
  })

  it("shows a partner's hint with who asked, and resolves this player's own", async () => {
    const { session, store, ws } = join()
    ws().receive({ type: 'hint', by: 0, hint: { index: 0, kind: 'fill' } as never })
    expect(store.getState().hint).toMatchObject({ index: 0 })
    expect(session.getState().hintBy).toBe(0)
    const asked = session.requestHint()
    ws().receive({ type: 'hint', by: 1, hint: { index: 1, kind: 'fill' } as never })
    await expect(asked).resolves.toMatchObject({ index: 1 })
    expect(session.getState().hintBy).toBe(1)
  })

  it('tracks partner cursors and pings, but not its own', () => {
    const { session, ws } = join()
    ws().receive({ type: 'cursor', seat: 0, i: 2 })
    ws().receive({ type: 'cursor', seat: 1, i: 3 })
    expect(session.getPresence().partners).toEqual([{ seat: 0, index: 2, initial: 'N' }])
    ws().receive({ type: 'ping', seat: 0, i: 1 })
    session.ping(3)
    expect(session.getPresence().pings.map(p => [p.seat, p.index, p.initial])).toEqual([
      [0, 1, 'N'],
      [1, 3, 'F'],
    ])
  })

  it('sends its pointer as a cursor, at most every 50ms', () => {
    const { store, sent, tick } = join()
    store.setHover({ row: 0, col: 1 })
    store.setHover({ row: 1, col: 0 })
    store.setHover({ row: 1, col: 1 })
    expect(sent('cursor')).toEqual([{ type: 'cursor', i: 1 }])
    tick(50)
    vi.advanceTimersByTime(50)
    expect(sent('cursor')).toEqual([
      { type: 'cursor', i: 1 },
      { type: 'cursor', i: 3 },
    ])
  })

  it('ends with the co-op', () => {
    const { session, ws } = join()
    ws().receive({ type: 'ended', reason: 'host' })
    ws().drop(4004)
    expect(session.getState().status).toBe('ended')
  })
})
