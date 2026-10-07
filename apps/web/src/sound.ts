/**
 * Sound effects, generated with Web Audio so there are no files to load. `play` is the only entry
 * point, so recorded sounds could replace these later. Silent while the per-device `sound` setting
 * is off, and until the first user gesture, since browsers only allow audio to start from one.
 */
import { getSettings } from './settings.ts'

export type SoundName = 'press' | 'fill' | 'pop' | 'peel' | 'thunk' | 'chime'

interface Tone {
  type: OscillatorType
  from: number
  to?: number
  duration: number
  gain: number
  delay?: number
}

const sounds: Record<SoundName, Tone[]> = {
  press: [{ type: 'triangle', from: 900, duration: 0.03, gain: 0.04 }],
  fill: [{ type: 'square', from: 440, duration: 0.04, gain: 0.03 }],
  pop: [{ type: 'square', from: 480, to: 1150, duration: 0.14, gain: 0.04 }],
  peel: [{ type: 'sawtooth', from: 900, to: 180, duration: 0.36, gain: 0.03 }],
  thunk: [{ type: 'triangle', from: 190, to: 80, duration: 0.16, gain: 0.12 }],
  chime: [523, 659, 784, 1047].map((from, i) => ({ type: 'square', from, duration: 0.1, gain: 0.04, delay: i * 0.09 })),
}

let ctx: AudioContext | null = null

function unlock() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
  } catch {
    return
  }
  removeEventListener('pointerdown', unlock)
  removeEventListener('keydown', unlock)
}

addEventListener('pointerdown', unlock)
addEventListener('keydown', unlock)

export function play(name: SoundName): void {
  if (!ctx || !getSettings().sound) return
  for (const { type, from, to, duration, gain, delay = 0 } of sounds[name]) {
    const start = ctx.currentTime + delay
    const osc = ctx.createOscillator()
    const amp = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, start)
    if (to) osc.frequency.exponentialRampToValueAtTime(to, start + duration)
    amp.gain.setValueAtTime(gain, start)
    amp.gain.exponentialRampToValueAtTime(0.001, start + duration)
    osc.connect(amp).connect(ctx.destination)
    osc.start(start)
    osc.stop(start + duration)
  }
}
