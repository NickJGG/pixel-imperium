import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PARTY_CLOSE, PARTY_PROTOCOL, type PartyServerMsg } from '@pixel-imperium/protocol'
import { fakeSockets } from './fake-socket.ts'
import { BACKOFF_MAX_MS, PartySocket, backoffMs } from './socket.ts'

const party: PartyServerMsg = { type: 'party', party: null, you: null }

describe('backoffMs', () => {
  it('doubles from half a second with up to as much again in jitter, capped', () => {
    expect(backoffMs(0, () => 0)).toBe(250)
    expect(backoffMs(0, () => 1)).toBe(500)
    expect(backoffMs(3, () => 0)).toBe(2000)
    expect(backoffMs(20, () => 1)).toBe(BACKOFF_MAX_MS)
  })
})

describe('PartySocket', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function connect() {
    const sockets = fakeSockets()
    const handlers = {
      hello: () => ({ type: 'hello' as const, protocol: PARTY_PROTOCOL, deviceToken: 'device-token-0123' }),
      onMessage: vi.fn(),
      onStatus: vi.fn(),
      onEnd: vi.fn(),
    }
    const socket = new PartySocket(handlers, { create: sockets.create, url: 'ws://test/ws', random: () => 0 })
    return { socket, sockets, handlers }
  }

  it('says hello on open and sends only once the party is in', () => {
    const { socket, sockets, handlers } = connect()
    expect(handlers.onStatus).toHaveBeenLastCalledWith('connecting')
    sockets.latest().open()
    expect(sockets.latest().sent).toEqual([{ type: 'hello', protocol: PARTY_PROTOCOL, deviceToken: 'device-token-0123' }])
    expect(socket.send({ type: 'undo' })).toBe(false)
    sockets.latest().receive(party)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('live')
    expect(handlers.onMessage).toHaveBeenCalledWith(party)
    expect(socket.send({ type: 'undo' })).toBe(true)
  })

  it('reconnects after a drop with a growing backoff, and says hello again', () => {
    const { socket, sockets, handlers } = connect()
    sockets.latest().open()
    sockets.latest().receive(party)
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
    expect(sockets.latest().sent[0]).toMatchObject({ type: 'hello' })
    sockets.latest().receive(party)
    expect(handlers.onStatus).toHaveBeenLastCalledWith('live')
  })

  it('starts the backoff over once live again', () => {
    const { sockets } = connect()
    for (let k = 0; k < 4; k++) {
      sockets.latest().drop()
      vi.runOnlyPendingTimers()
    }
    sockets.latest().open()
    sockets.latest().receive(party)
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
    sockets.latest().drop(PARTY_CLOSE.restarting)
    vi.advanceTimersByTime(250)
    expect(sockets.made).toHaveLength(4)
  })

  it.each([
    [PARTY_CLOSE.notAllowed, 'not-allowed'],
    [PARTY_CLOSE.outdated, 'outdated'],
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
