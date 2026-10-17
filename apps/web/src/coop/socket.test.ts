import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COOP_CLOSE, COOP_PROTOCOL, type CoopServerMsg } from '@pixel-imperium/protocol'
import { fakeSockets } from './fake-socket.ts'
import { BACKOFF_MAX_MS, CoopSocket, backoffMs } from './socket.ts'

const snapshot: CoopServerMsg = {
  type: 'snapshot',
  room: { code: 'abc', puzzleId: 'p', cells: '....', seats: [], solved: false },
  you: 1,
}

describe('backoffMs', () => {
  it('doubles from half a second with up to as much again in jitter, capped', () => {
    expect(backoffMs(0, () => 0)).toBe(250)
    expect(backoffMs(0, () => 1)).toBe(500)
    expect(backoffMs(3, () => 0)).toBe(2000)
    expect(backoffMs(20, () => 1)).toBe(BACKOFF_MAX_MS)
  })
})

describe('CoopSocket', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function connect() {
    const sockets = fakeSockets()
    let code = 'abc'
    const handlers = {
      join: () => ({ type: 'join' as const, code, deviceToken: 'device-token-0123', protocol: COOP_PROTOCOL }),
      onMessage: vi.fn(),
      onStatus: vi.fn(),
      onEnd: vi.fn(),
    }
    const socket = new CoopSocket(handlers, { create: sockets.create, url: 'ws://test/ws', random: () => 0 })
    return { socket, sockets, handlers, relink: (to: string) => (code = to) }
  }

  it('joins on open and sends only once the snapshot is in', () => {
    const { socket, sockets, handlers } = connect()
    expect(handlers.onStatus).toHaveBeenLastCalledWith('connecting')
    sockets.latest().open()
    expect(sockets.latest().sent).toEqual([{ type: 'join', code: 'abc', deviceToken: 'device-token-0123', protocol: COOP_PROTOCOL }])
    expect(socket.send({ type: 'undo' })).toBe(false)
    sockets.latest().receive(snapshot)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('live')
    expect(handlers.onMessage).toHaveBeenCalledWith(snapshot)
    expect(socket.send({ type: 'undo' })).toBe(true)
  })

  it('reconnects after a drop with a growing backoff, and rejoins on the current link', () => {
    const { socket, sockets, handlers, relink } = connect()
    sockets.latest().open()
    sockets.latest().receive(snapshot)
    relink('def')
    sockets.latest().drop()
    expect(handlers.onStatus).toHaveBeenLastCalledWith('reconnecting')
    expect(socket.send({ type: 'undo' })).toBe(false)
    vi.advanceTimersByTime(249)
    expect(sockets.made).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(sockets.made).toHaveLength(2)
    sockets.latest().drop()
    vi.advanceTimersByTime(499)
    expect(sockets.made).toHaveLength(2)
    vi.advanceTimersByTime(1)
    expect(sockets.made).toHaveLength(3)
    sockets.latest().open()
    expect(sockets.latest().sent[0]).toMatchObject({ type: 'join', code: 'def' })
    sockets.latest().receive(snapshot)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('live')
  })

  it('starts the backoff over once joined again', () => {
    const { sockets } = connect()
    for (let k = 0; k < 4; k++) {
      sockets.latest().drop()
      vi.runOnlyPendingTimers()
    }
    sockets.latest().open()
    sockets.latest().receive(snapshot)
    sockets.latest().drop()
    vi.advanceTimersByTime(250)
    expect(sockets.made).toHaveLength(6)
  })

  it('comes straight back from a server restart', () => {
    const { sockets } = connect()
    sockets.latest().drop()
    vi.runOnlyPendingTimers()
    sockets.latest().drop()
    vi.runOnlyPendingTimers()
    sockets.latest().drop(COOP_CLOSE.restarting)
    vi.advanceTimersByTime(250)
    expect(sockets.made).toHaveLength(4)
  })

  it.each([
    [COOP_CLOSE.removed, 'removed'],
    [COOP_CLOSE.full, 'full'],
    [COOP_CLOSE.ended, 'ended'],
    [COOP_CLOSE.notAllowed, 'not-allowed'],
    [COOP_CLOSE.outdated, 'outdated'],
  ])('stops for good on close code %i', (code, reason) => {
    const { sockets, handlers } = connect()
    sockets.latest().open()
    sockets.latest().drop(code)
    expect(handlers.onEnd).toHaveBeenCalledWith(reason)
    vi.runAllTimers()
    expect(sockets.made).toHaveLength(1)
  })

  it('stops on outdated, asking for a reload', () => {
    const { sockets, handlers } = connect()
    sockets.latest().open()
    sockets.latest().receive({ type: 'outdated' })
    expect(handlers.onEnd).toHaveBeenCalledWith('outdated')
    expect(handlers.onMessage).not.toHaveBeenCalled()
  })

  it('closes without reconnecting', () => {
    const { socket, sockets } = connect()
    sockets.latest().drop()
    socket.close()
    vi.runAllTimers()
    expect(sockets.made).toHaveLength(1)
  })
})
