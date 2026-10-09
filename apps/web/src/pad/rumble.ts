/**
 * Controller rumble for the big moments, gated by the Sound setting. Only Chromium exposes
 * `vibrationActuator`; elsewhere this does nothing.
 */
import { getSettings } from '../settings.ts'

export type Rumble = 'solve' | 'conquest'

/** Each pulse is [start ms, duration ms, strong, weak]. */
const EFFECTS: Record<Rumble, readonly (readonly [number, number, number, number])[]> = {
  solve: [[0, 220, 0.6, 0.6]],
  conquest: [
    [0, 180, 0.8, 0.5],
    [300, 380, 1, 0.8],
  ],
}

export function rumble(kind: Rumble): void {
  if (!getSettings().sound) return
  const actuator = [...(navigator.getGamepads?.() ?? [])].find(p => p?.vibrationActuator)?.vibrationActuator
  if (!actuator) return
  // Timed rather than `startDelay`, since a second playEffect cuts off the one still running.
  for (const [start, duration, strongMagnitude, weakMagnitude] of EFFECTS[kind]) {
    setTimeout(() => {
      actuator.playEffect('dual-rumble', { duration, strongMagnitude, weakMagnitude }).catch(() => {})
    }, start)
  }
}
