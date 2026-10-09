import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settings = vi.hoisted(() => ({ sound: true }))
vi.mock('../settings.ts', () => ({ getSettings: () => settings }))

const { rumble } = await import('./rumble.ts')

function stubPads(...pads: unknown[]) {
  vi.stubGlobal('navigator', { getGamepads: () => pads })
}

describe('rumble', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    settings.sound = true
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('plays each pulse of the effect at its time', () => {
    const playEffect = vi.fn(() => Promise.resolve('complete'))
    stubPads(null, { vibrationActuator: { playEffect } })
    rumble('conquest')
    vi.advanceTimersByTime(0)
    expect(playEffect).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(300)
    expect(playEffect).toHaveBeenLastCalledWith('dual-rumble', { duration: 380, strongMagnitude: 1, weakMagnitude: 0.8 })
  })

  it('stays still with sound off', () => {
    const playEffect = vi.fn(() => Promise.resolve('complete'))
    stubPads({ vibrationActuator: { playEffect } })
    settings.sound = false
    rumble('solve')
    vi.runAllTimers()
    expect(playEffect).not.toHaveBeenCalled()
  })

  it('does nothing without an actuator or the Gamepad API', () => {
    stubPads({ vibrationActuator: null })
    expect(() => rumble('solve')).not.toThrow()
    vi.stubGlobal('navigator', {})
    expect(() => rumble('solve')).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('swallows a rejected effect', async () => {
    stubPads({ vibrationActuator: { playEffect: () => Promise.reject(new Error('busy')) } })
    rumble('solve')
    vi.runAllTimers()
    await Promise.resolve()
  })
})
