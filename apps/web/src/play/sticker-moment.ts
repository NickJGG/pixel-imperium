/**
 * The solve moment's choreography, run with the Web Animations API on a fixed-position element in
 * viewport coordinates: the sticker pops out of the board, wobbles, then peels away to its slot.
 */
import { play } from '../sound.ts'

export interface Choreography {
  finished: Promise<void>
  cancel: () => void
}

const at = (x: number, y: number, scale: number, rotate: number) =>
  `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`

const center = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2] as const

/** Big enough to read as the board's picture lifting off, without blowing up the sticker's border. */
const popScale = (board: DOMRect, width: number) => Math.min(board.width * 0.7, 220) / width

type Step = [Keyframe[], KeyframeAnimationOptions]

function run(el: HTMLElement, steps: (Step | (() => void))[]): Choreography {
  let current: Animation | null = null
  let cancelled = false
  const finished = (async () => {
    for (const step of steps) {
      if (cancelled) throw new DOMException('cancelled', 'AbortError')
      if (typeof step === 'function') {
        step()
        continue
      }
      current = el.animate(step[0], { fill: 'forwards', ...step[1] })
      await current.finished
    }
  })()
  return {
    finished,
    cancel: () => {
      cancelled = true
      current?.cancel()
    },
  }
}

function popSteps(x: number, y: number, s: number): (Step | (() => void))[] {
  return [
    () => play('pop'),
    [
      [{ transform: at(x, y, 0, -20) }, { transform: at(x, y, s * 1.14, -4), offset: 0.6 }, { transform: at(x, y, s, -8) }],
      { duration: 420, easing: 'cubic-bezier(.3, 1.6, .5, 1)' },
    ],
    [
      [-8, 5, -5, 2, -8].map(r => ({ transform: at(x, y, s, r) })),
      { duration: 520 },
    ],
  ]
}

/** Pops `el` (sized to the slot) out of `board`, then flies it into `slot`, landing at `tilt`. */
export function flyIn(el: HTMLElement, board: DOMRect, slot: DOMRect, tilt: number): Choreography {
  const [x0, y0] = center(board)
  const [x1, y1] = center(slot)
  const s = popScale(board, slot.width)
  return run(el, [
    ...popSteps(x0, y0, s),
    () => play('peel'),
    [
      [
        { transform: at(x0, y0, s, -8) },
        { transform: at((x0 + x1) / 2, Math.min(y0, y1) - 50, s * 1.1, 14), offset: 0.45 },
        { transform: at(x1, y1, 1, tilt) },
      ],
      { duration: 720, easing: 'cubic-bezier(.5, 0, .3, 1)' },
    ],
  ])
}

/** A replay's re-solve: the sticker pops out of the board and settles back into it. */
export function popOnly(el: HTMLElement, board: DOMRect): Choreography {
  const [x, y] = center(board)
  const s = popScale(board, el.offsetWidth)
  return run(el, [
    ...popSteps(x, y, s),
    [
      [
        { transform: at(x, y, s, -8), opacity: 1 },
        { transform: at(x, y, s * 0.6, 0), opacity: 0 },
      ],
      { duration: 280, easing: 'ease-in' },
    ],
  ])
}

const CONFETTI = ['#ff4fa3', '#3de7e0', '#ffc92e', '#ffffff']
const CONFETTI_PX = 4

/** A burst of pixel confetti over `host`, which must be positioned. Returns a cleanup. */
export function confetti(host: HTMLElement, className: string): () => void {
  const canvas = document.createElement('canvas')
  canvas.className = className
  canvas.setAttribute('aria-hidden', 'true')
  host.append(canvas)
  const { width, height } = host.getBoundingClientRect()
  canvas.width = Math.ceil(width / CONFETTI_PX)
  canvas.height = Math.ceil(height / CONFETTI_PX)
  const ctx = canvas.getContext('2d')!
  const parts = Array.from({ length: 50 }, () => {
    const a = Math.random() * Math.PI * 2
    const v = 1 + Math.random() * 2.6
    return {
      x: canvas.width / 2,
      y: canvas.height * 0.4,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 1.6,
      color: CONFETTI[Math.floor(Math.random() * CONFETTI.length)]!,
    }
  })
  let frame = 0
  let last = 0
  let ticks = 0
  // Stepped at 24 fps, like the pixel art it's made of.
  const tick = (now: number) => {
    if (now - last >= 1000 / 24) {
      last = now
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      for (const p of parts) {
        p.x += p.vx
        p.y += p.vy
        p.vy += 0.12
        ctx.fillStyle = p.color
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1)
      }
      if (++ticks > 50) return canvas.remove()
    }
    frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
  return () => {
    cancelAnimationFrame(frame)
    canvas.remove()
  }
}
