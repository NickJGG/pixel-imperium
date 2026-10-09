import { type Frame, type PadEvent, Repeater, readFrame } from './input.ts'

export interface PollerHandlers {
  /** Every animation frame while a pad is connected; `dt` is in seconds. */
  frame(frame: Frame, dt: number): void
  event(event: PadEvent): void
  disconnect(): void
}

/** Polls while any pad is connected, which browsers only report after its first button press. */
export function startPolling(handlers: PollerHandlers): () => void {
  const repeater = new Repeater()
  const pads = () => navigator.getGamepads?.() ?? []
  const connected = () => pads().some(p => p?.connected)
  let raf = 0
  let last = 0

  const tick = (now: number) => {
    raf = 0
    const frame = readFrame(pads())
    // Capped so a frame after a stall can't zoom or pan in one leap.
    const dt = last === 0 ? 0 : Math.min((now - last) / 1000, 0.1)
    last = now
    handlers.frame(frame, dt)
    for (const e of repeater.update(frame.down, now)) handlers.event(e)
    if (connected()) raf = requestAnimationFrame(tick)
    else last = 0
  }
  const start = () => {
    raf ||= requestAnimationFrame(tick)
  }
  const disconnect = () => {
    for (const e of repeater.releaseAll()) handlers.event(e)
    handlers.disconnect()
  }

  addEventListener('gamepadconnected', start)
  addEventListener('gamepaddisconnected', disconnect)
  if (connected()) start()
  return () => {
    cancelAnimationFrame(raf)
    removeEventListener('gamepadconnected', start)
    removeEventListener('gamepaddisconnected', disconnect)
  }
}
