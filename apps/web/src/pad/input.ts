/**
 * Reading controllers: every connected standard-mapping pad merges into one frame, and a `Repeater`
 * turns successive frames into press, repeat and release events.
 */
import { PAN_DEAD, REPEAT_DELAY_MS, REPEAT_EVERY_MS, STICK_DEAD, TRIGGER_DEAD } from './tuning.ts'

/** Xbox labels, at their standard-mapping indices. */
export const BUTTON_INDEX = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  View: 8,
  Menu: 9,
  RS: 11,
  Up: 12,
  Down: 13,
  Left: 14,
  Right: 15,
} as const

export type PadButton = keyof typeof BUTTON_INDEX
export type Direction = 'Up' | 'Down' | 'Left' | 'Right'

export const DIRECTIONS: Record<Direction, readonly [dRow: number, dCol: number]> = {
  Up: [-1, 0],
  Down: [1, 0],
  Left: [0, -1],
  Right: [0, 1],
}

export const isDirection = (button: PadButton): button is Direction => button in DIRECTIONS

const BUTTONS = Object.keys(BUTTON_INDEX) as PadButton[]

/** The parts of `Gamepad` read here, so tests can pass plain objects. */
export interface PadLike {
  readonly mapping: string
  readonly buttons: readonly { readonly pressed: boolean; readonly value: number }[]
  readonly axes: readonly number[]
}

export interface Frame {
  /** Includes the left stick folded into the d-pad. */
  down: ReadonlySet<PadButton>
  lt: number
  rt: number
  rx: number
  ry: number
}

const stronger = (a: number, b: number) => (Math.abs(b) > Math.abs(a) ? b : a)

export function readFrame(pads: readonly (PadLike | null)[]): Frame {
  const down = new Set<PadButton>()
  let lx = 0
  let ly = 0
  let rx = 0
  let ry = 0
  let lt = 0
  let rt = 0
  for (const pad of pads) {
    if (pad?.mapping !== 'standard') continue
    for (const b of BUTTONS) if (pad.buttons[BUTTON_INDEX[b]]?.pressed) down.add(b)
    lt = Math.max(lt, pad.buttons[BUTTON_INDEX.LT]?.value ?? 0)
    rt = Math.max(rt, pad.buttons[BUTTON_INDEX.RT]?.value ?? 0)
    const [a0 = 0, a1 = 0, a2 = 0, a3 = 0] = pad.axes
    lx = stronger(lx, a0)
    ly = stronger(ly, a1)
    rx = stronger(rx, a2)
    ry = stronger(ry, a3)
  }
  if (lx < -STICK_DEAD) down.add('Left')
  if (lx > STICK_DEAD) down.add('Right')
  if (ly < -STICK_DEAD) down.add('Up')
  if (ly > STICK_DEAD) down.add('Down')
  return { down, lt, rt, rx, ry }
}

/** Whether the triggers or right stick are past their deadzones; buttons are seen as press events. */
export const analogActive = ({ lt, rt, rx, ry }: Frame): boolean =>
  lt > TRIGGER_DEAD || rt > TRIGGER_DEAD || Math.abs(rx) > PAN_DEAD || Math.abs(ry) > PAN_DEAD

export interface PadEvent {
  kind: 'press' | 'repeat' | 'release'
  button: PadButton
}

/** Only directions repeat: after `REPEAT_DELAY_MS` held, then every `REPEAT_EVERY_MS`. */
export class Repeater {
  /** Each held button, with when it next repeats. */
  private held = new Map<PadButton, number>()

  update(down: ReadonlySet<PadButton>, now: number): PadEvent[] {
    const events: PadEvent[] = []
    for (const [button, next] of this.held) {
      if (!down.has(button)) {
        this.held.delete(button)
        events.push({ kind: 'release', button })
      } else if (isDirection(button) && now >= next) {
        this.held.set(button, now + REPEAT_EVERY_MS)
        events.push({ kind: 'repeat', button })
      }
    }
    for (const button of down) {
      if (this.held.has(button)) continue
      this.held.set(button, now + REPEAT_DELAY_MS)
      events.push({ kind: 'press', button })
    }
    return events
  }

  releaseAll(): PadEvent[] {
    const events = [...this.held.keys()].map(button => ({ kind: 'release' as const, button }))
    this.held.clear()
    return events
  }
}
