import { describe, expect, it } from 'vitest'
import { BUTTON_INDEX, type PadButton, type PadLike, Repeater, readFrame } from './input.ts'
import { REPEAT_DELAY_MS, REPEAT_EVERY_MS } from './tuning.ts'

function pad({
  pressed = [],
  axes = [0, 0, 0, 0],
  lt = 0,
  rt = 0,
  mapping = 'standard',
}: { pressed?: PadButton[]; axes?: number[]; lt?: number; rt?: number; mapping?: string } = {}): PadLike {
  const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }))
  for (const b of pressed) buttons[BUTTON_INDEX[b]] = { pressed: true, value: 1 }
  buttons[BUTTON_INDEX.LT] = { pressed: lt > 0.5, value: lt }
  buttons[BUTTON_INDEX.RT] = { pressed: rt > 0.5, value: rt }
  return { mapping, buttons, axes }
}

describe('readFrame', () => {
  it('ORs buttons across pads', () => {
    const { down } = readFrame([pad({ pressed: ['A'] }), null, pad({ pressed: ['LB'] })])
    expect([...down].sort()).toEqual(['A', 'LB'])
  })

  it('ignores pads without the standard mapping', () => {
    expect(readFrame([pad({ pressed: ['A'], mapping: '' })]).down.size).toBe(0)
  })

  it('takes the strongest stick axis and the deepest trigger', () => {
    const frame = readFrame([pad({ axes: [0, 0, 0.3, -0.9], lt: 0.2 }), pad({ axes: [0, 0, -0.6, 0.1], lt: 0.7, rt: 0.4 })])
    expect(frame).toMatchObject({ rx: -0.6, ry: -0.9, lt: 0.7, rt: 0.4 })
  })

  it('folds the left stick into the d-pad past the deadzone', () => {
    expect([...readFrame([pad({ axes: [-0.8, 0.9] })]).down].sort()).toEqual(['Down', 'Left'])
    expect(readFrame([pad({ axes: [0.4, -0.4] })]).down.size).toBe(0)
  })

  it('lets one pad’s stick outweigh another’s at rest', () => {
    expect([...readFrame([pad({ axes: [0.9, 0] }), pad()]).down]).toEqual(['Right'])
  })
})

describe('Repeater', () => {
  const kinds = (events: { kind: string; button: string }[]) => events.map(e => `${e.kind} ${e.button}`)

  it('repeats a held direction after the delay, then at the interval', () => {
    const r = new Repeater()
    const down = new Set<PadButton>(['Up'])
    expect(kinds(r.update(down, 0))).toEqual(['press Up'])
    expect(r.update(down, REPEAT_DELAY_MS - 1)).toEqual([])
    expect(kinds(r.update(down, REPEAT_DELAY_MS))).toEqual(['repeat Up'])
    expect(r.update(down, REPEAT_DELAY_MS + REPEAT_EVERY_MS - 1)).toEqual([])
    expect(kinds(r.update(down, REPEAT_DELAY_MS + REPEAT_EVERY_MS))).toEqual(['repeat Up'])
    expect(kinds(r.update(new Set(), 1000))).toEqual(['release Up'])
  })

  it('never repeats other buttons', () => {
    const r = new Repeater()
    const down = new Set<PadButton>(['A'])
    r.update(down, 0)
    expect(r.update(down, 5000)).toEqual([])
  })

  it('releases before pressing, so a stick flicked across reads as two taps', () => {
    const r = new Repeater()
    r.update(new Set(['Left']), 0)
    expect(kinds(r.update(new Set(['Right']), 16))).toEqual(['release Left', 'press Right'])
  })

  it('releases everything held on disconnect', () => {
    const r = new Repeater()
    r.update(new Set(['A', 'Down']), 0)
    expect(kinds(r.releaseAll()).sort()).toEqual(['release A', 'release Down'])
    expect(kinds(r.update(new Set(['A']), 16))).toEqual(['press A'])
  })
})
