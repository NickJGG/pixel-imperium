import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PartyInvite } from '@pixel-imperium/protocol'
import type { Started } from './session.ts'
import { SLIP_MS, Tucks, pickSlip, waiting } from './slip.ts'

const invite = (id: string): PartyInvite => ({ id, from: 'juno', host: 'juno', size: 2, puzzle: null })
const started: Started = { puzzleId: 'p1', title: 'Acorn', by: 'juno' }
const none = () => false

describe('pickSlip', () => {
  it('shows nothing with nothing waiting', () => {
    expect(pickSlip({ invites: [], started: null }, none)).toBeNull()
  })

  it("shows the Party's new puzzle before any invite", () => {
    expect(pickSlip({ invites: [invite('a')], started }, none)).toEqual({ kind: 'started', started })
  })

  it('shows the newest invite', () => {
    const b = invite('b')
    expect(pickSlip({ invites: [invite('a'), b], started: null }, none)).toEqual({ kind: 'invite', invite: b })
  })

  it('skips what has tucked', () => {
    const a = invite('a')
    const b = invite('b')
    const tucked = (item: object) => item === b || item === started
    expect(pickSlip({ invites: [a, b], started }, tucked)).toEqual({ kind: 'invite', invite: a })
    expect(pickSlip({ invites: [b], started }, tucked)).toBeNull()
  })
})

describe('waiting', () => {
  const quiet = { invites: [], started: null, friendRequests: [], notice: null }

  it('is quiet with nothing unanswered', () => {
    expect(waiting(quiet)).toBe(false)
  })

  it.each([
    ['an invite', { invites: [invite('a')] }],
    ['a new puzzle', { started }],
    ['a friend request', { friendRequests: ['juno'] }],
    ['a notice', { notice: { kind: 'host' } as const }],
  ])('dots for %s', (_, change) => {
    expect(waiting({ ...quiet, ...change })).toBe(true)
  })
})

describe('Tucks', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('tucks an item a while after it first shows, and tells listeners', () => {
    const tucks = new Tucks()
    const item = {}
    const listener = vi.fn()
    tucks.subscribe(listener)
    tucks.shown(item)
    vi.advanceTimersByTime(SLIP_MS - 1)
    expect(tucks.has(item)).toBe(false)
    vi.advanceTimersByTime(1)
    expect(tucks.has(item)).toBe(true)
    expect(listener).toHaveBeenCalledTimes(1)
    expect(tucks.getVersion()).toBe(1)
  })

  it('times an item once however often it shows', () => {
    const tucks = new Tucks()
    const item = {}
    tucks.shown(item)
    vi.advanceTimersByTime(SLIP_MS / 2)
    tucks.shown(item)
    vi.advanceTimersByTime(SLIP_MS / 2)
    expect(tucks.has(item)).toBe(true)
    expect(tucks.getVersion()).toBe(1)
  })
})
