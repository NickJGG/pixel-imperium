import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cluesFromSolution } from '@pixel-imperium/nonogram'
import type { PartySeat, PartyServerMsg, PartyState } from '@pixel-imperium/protocol'
import { stubStorage } from '../test-storage.ts'
import { PlayStore } from '../play/store.ts'
import { PartyStorage } from './party-storage.ts'
import { fakeSockets } from './fake-socket.ts'
import { PartySession } from './session.ts'

// 2×2, top row filled.
const solution = [true, true, false, false]
const seat = (n: number, name: string, extra: Partial<PartySeat> = {}): PartySeat => ({
  seat: n,
  name,
  account: n === 0,
  connected: true,
  here: true,
  cursor: null,
  ...extra,
})
const state = (puzzle: string | null = 'p', seats = [seat(0, 'nick'), seat(1, 'Guest Fox')]): PartyState => ({
  code: 'abc',
  host: 0,
  seats,
  puzzle: puzzle === null ? null : { id: puzzle, title: 'Acorn' },
})
const partyMsg = (party: PartyState | null = state(), you: number | null = 1): PartyServerMsg => ({ type: 'party', party, you })
const snapshot = (cells: string, puzzleId = 'p'): PartyServerMsg => ({ type: 'snapshot', grid: { puzzleId, cells, solved: false } })

describe('PartySession', () => {
  beforeEach(() => {
    stubStorage()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  function connect(onMove = vi.fn()) {
    const sockets = fakeSockets()
    let t = 0
    const session = new PartySession({ deviceToken: 'device-token-0123', onMove, now: () => t, socket: { create: sockets.create, url: 'ws://test/ws' } })
    session.start()
    sockets.latest().open()
    const ws = () => sockets.latest()
    const sent = (type: string) => ws().sent.filter(m => m.type === type)
    return { session, ws, sent, sockets, onMove, tick: (ms: number) => (t += ms) }
  }

  function join(cells = '....') {
    const c = connect()
    c.session.setHere('p')
    c.ws().receive(partyMsg())
    c.ws().receive(snapshot(cells))
    const store = new PlayStore(
      { id: 'p', width: 2, height: 2, clues: cluesFromSolution(2, 2, solution) },
      { storage: new PartyStorage(null, () => c.session.grid(), false), party: c.session },
    )
    const unbind = c.session.bind(store)
    return { ...c, store, unbind }
  }

  const grid = (store: PlayStore) => store.getState().cells.map(c => ({ empty: '.', filled: '#', marked: 'x' })[c]).join('')

  describe('the grid', () => {
    it('opens on the snapshot', () => {
      const { store, session } = join('#...')
      expect(grid(store)).toBe('#...')
      expect(session.getState().grid).toBe('p')
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
      ws().receive(partyMsg())
      // The server forgot where this tab was, so it's told again before the snapshot comes.
      expect(ws().sent).toEqual([expect.objectContaining({ type: 'hello' }), { type: 'here', puzzleId: 'p' }])
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
      ws().receive(partyMsg())
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

    it('tracks the cursors and pings of partners on the page, but not its own', () => {
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
      ws().receive({ type: 'seats', seats: [seat(0, 'nick', { here: false, cursor: 2 }), seat(1, 'Guest Fox')] })
      expect(session.getPresence().partners).toEqual([])
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

    it('drops the grid on leaving its page, and ignores what the server sent before it heard', () => {
      const { session, ws, sent } = join('#...')
      session.setHere(null)
      expect(sent('here')).toEqual([
        { type: 'here', puzzleId: 'p' },
        { type: 'here', puzzleId: null },
      ])
      expect(session.getState().grid).toBeNull()
      ws().receive(snapshot('##..'))
      ws().receive({ type: 'stroke', id: 4, by: 0, changes: [{ i: 1, to: '#' }] })
      expect(session.getState().grid).toBeNull()
      expect(session.grid()).toEqual([])
    })

    it('drops the grid when the Party ends', () => {
      const { session, ws } = join()
      ws().receive({ type: 'ended', reason: 'host' })
      expect(session.getState()).toMatchObject({ party: null, you: null, grid: null, notice: { kind: 'ended', reason: 'host' } })
    })
  })

  describe('the party', () => {
    it('tells the server where this tab is once it has said hello, and sends what was asked meanwhile', () => {
      const { session, ws } = connect()
      session.setHere('p')
      session.join('xyz')
      expect(ws().sent).toEqual([expect.objectContaining({ type: 'hello' })])
      ws().receive(partyMsg(null, null))
      expect(ws().sent.slice(1)).toEqual([
        { type: 'here', puzzleId: 'p' },
        { type: 'join', code: 'xyz' },
      ])
      expect(session.getState().status).toBe('live')
    })

    it('shows a refused join until the next try', () => {
      const { session, ws } = connect()
      ws().receive(partyMsg(null, null))
      session.join('xyz', true)
      expect(ws().sent.at(-1)).toEqual({ type: 'join', code: 'xyz', started: true })
      ws().receive({ type: 'refused', reason: 'full' })
      expect(session.getState().refused).toBe('full')
      session.join('xyz')
      expect(session.getState().refused).toBeNull()
    })

    it("follows the Host's move while on the grid's page, the next snapshot being the new puzzle's", () => {
      const { session, ws, store, onMove, sent } = join('#...')
      store.beginStroke({ row: 1, col: 0 }, 'mark', { lockAxis: false })
      ws().receive({ type: 'move', puzzleId: 'q' })
      expect(onMove).toHaveBeenCalledWith('q')
      expect(session.getState().grid).toBeNull()
      ws().receive(partyMsg(state('q')))
      ws().receive(snapshot('x...', 'q'))
      expect(session.getState().grid).toBe('q')
      expect(session.grid()).toEqual(['marked', 'empty', 'empty', 'empty'])
      // The server already counts this tab on the new page, so arriving there says nothing more.
      session.setHere('q')
      expect(sent('here')).toEqual([{ type: 'here', puzzleId: 'p' }])
    })

    it("prompts while away when the Party starts a puzzle, until this tab goes there", () => {
      const { session, ws } = connect()
      session.setHere(null)
      ws().receive(partyMsg(state(null)))
      ws().receive({ type: 'started', puzzleId: 'q', title: 'Acorn', by: 'nick' })
      ws().receive(partyMsg(state('q')))
      expect(session.getState().started).toEqual({ puzzleId: 'q', title: 'Acorn', by: 'nick' })
      session.setHere('q')
      expect(session.getState().started).toBeNull()
    })

    it('forgets a prompt once the Party moves on again', () => {
      const { session, ws } = connect()
      ws().receive(partyMsg(state('q')))
      ws().receive({ type: 'started', puzzleId: 'q', title: 'Acorn', by: 'nick' })
      ws().receive(partyMsg(state('r')))
      expect(session.getState().started).toBeNull()
    })

    it('keeps invites until answered or taken back', () => {
      const { session, ws, sent } = connect()
      ws().receive(partyMsg(null, null))
      const invite = { id: 'i1', from: 'juno', host: 'juno', size: 2, puzzle: null }
      ws().receive({ type: 'invite', invite })
      ws().receive({ type: 'invite', invite: { ...invite, id: 'i2', from: 'sam', host: 'sam' } })
      ws().receive({ type: 'invite', invite: { ...invite, size: 3 } })
      expect(session.getState().invites.map(i => [i.id, i.size])).toEqual([
        ['i2', 2],
        ['i1', 3],
      ])
      ws().receive({ type: 'uninvite', id: 'i2' })
      session.respond('i1', true)
      expect(session.getState().invites).toEqual([])
      expect(sent('respond')).toEqual([{ type: 'respond', inviteId: 'i1', accept: true }])
    })

    it('merges presence by Handle, online first', () => {
      const { session, ws } = connect()
      ws().receive(partyMsg(null, null))
      ws().receive({
        type: 'presence',
        full: true,
        friends: [
          { handle: 'bea', online: false, party: null },
          { handle: 'Cal', online: true, party: null },
          { handle: 'ada', online: false, party: null },
        ],
      })
      ws().receive({ type: 'presence', full: false, friends: [{ handle: 'ada', online: true, party: 2 }] })
      expect(session.getState().friends.map(f => [f.handle, f.online, f.party])).toEqual([
        ['ada', true, 2],
        ['Cal', true, null],
        ['bea', false, null],
      ])
      ws().receive({ type: 'presence', full: true, friends: [{ handle: 'bea', online: true, party: null }] })
      expect(session.getState().friends.map(f => f.handle)).toEqual(['bea'])
    })

    it("says so when this player becomes the Host, and tracks the Party's link", () => {
      const { session, ws } = connect()
      ws().receive(partyMsg())
      ws().receive({ type: 'host', seat: 1 })
      expect(session.getState()).toMatchObject({ notice: { kind: 'host' }, party: { host: 1 } })
      session.dismissNotice()
      ws().receive({ type: 'link', code: 'def' })
      expect(session.getState()).toMatchObject({ notice: null, party: { code: 'def' } })
    })

    it('collects friend requests once each, until answered', () => {
      const { session, ws } = connect()
      ws().receive(partyMsg(null, null))
      ws().receive({ type: 'friendRequest', from: 'juno' })
      ws().receive({ type: 'friendRequest', from: 'juno' })
      expect(session.getState().friendRequests).toEqual(['juno'])
      session.answeredFriendRequest('Juno')
      expect(session.getState().friendRequests).toEqual([])
    })

    it('forgets everything on stop', () => {
      const { session, ws } = join()
      session.stop()
      expect(ws().closedWith).toBe(1000)
      expect(session.getState()).toMatchObject({ status: 'off', party: null, grid: null })
      expect(session.running).toBe(false)
    })
  })
})
