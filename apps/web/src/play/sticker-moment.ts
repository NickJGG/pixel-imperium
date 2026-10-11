/**
 * The solve moment's choreography, run with the Web Animations API in viewport coordinates. A first solve's
 * banner slams in across the screen carrying the sticker, holds, and snaps shut; the sticker hangs where the
 * banner left it, then flies to its slot. A replay's re-solve just pops the sticker out of the board.
 */
import { play } from '../sound.ts'

export interface Choreography {
  finished: Promise<void>
  cancel: () => void
}

/** Where a sticker sits on screen: its centre, its untransformed width and its rotation in degrees. */
export interface Pose {
  x: number
  y: number
  width: number
  angle: number
}

const at = (x: number, y: number, scale: number, rotate: number) =>
  `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`

const center = (r: DOMRect) => [r.left + r.width / 2, r.top + r.height / 2] as const

type Animate = (el: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions) => Promise<void>

/** Runs `script`; cancelling stops every animation and pause it started and rejects `finished`. */
function run(script: (animate: Animate, wait: (ms: number) => Promise<void>) => Promise<void>): Choreography {
  const stops: (() => void)[] = []
  let cancelled = false
  const abort = () => new DOMException('cancelled', 'AbortError')
  const animate: Animate = (el, keyframes, options) => {
    if (cancelled) return Promise.reject(abort())
    const animation = el.animate(keyframes, { fill: 'forwards', ...options })
    stops.push(() => animation.cancel())
    return animation.finished.then(() => {})
  }
  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (cancelled) return reject(abort())
      const timer = setTimeout(resolve, ms)
      stops.push(() => {
        clearTimeout(timer)
        reject(abort())
      })
    })
  return {
    finished: script(animate, wait),
    cancel: () => {
      cancelled = true
      for (const stop of stops) stop()
    },
  }
}

export interface Celebration {
  /** The banner's band, laid out at rest: upright, centred, unscaled. */
  band: HTMLElement
  /** The band's lean, in degrees. */
  angle: number
  /** Shaken as the band lands, for a Foil or the gold. */
  shake: HTMLElement | null
  /** As the band lands. */
  onLand: () => void
  /** Carries the banner's sticker to its slot once the banner has gone; absent, the banner has no sticker. */
  handOff?: HandOff | undefined
}

interface HandOff {
  float: HTMLElement
  /** The banner's own copy, hidden as the float takes its place. */
  sticker: HTMLElement
  from: () => Pose
  to: () => Pose
}

/** Slams the banner in, holds it, snaps it shut, then flies its sticker into the slot. */
export function celebrate({ band, angle, shake, onLand, handOff }: Celebration): Choreography {
  const pose = (scaleX: number, scaleY = scaleX) => ({ transform: `rotate(${angle}deg) scale(${scaleX}, ${scaleY})` })
  return run(async (animate, wait) => {
    await animate(
      band,
      [
        { ...pose(1.8), opacity: 0 },
        { ...pose(0.94), opacity: 1, offset: 0.5 },
        { ...pose(1.03), offset: 0.75 },
        { ...pose(1), opacity: 1 },
      ],
      { duration: 540, easing: 'ease-out' },
    )
    onLand()
    if (shake) {
      animate(
        shake,
        ['none', 'translate(-7px, 4px)', 'translate(6px, -3px)', 'translate(-3px, 2px)', 'none'].map(transform => ({ transform })),
        // No fill: a transform left on the shell would make it the containing block for its fixed children.
        { duration: 320, fill: 'none' },
      ).catch(() => {})
    }
    await wait(1000)
    const from = handOff?.from()
    if (handOff && from) {
      handOff.float.style.width = `${from.width}px`
      handOff.float.style.transform = at(from.x, from.y, 1, from.angle)
      handOff.sticker.style.visibility = 'hidden'
      play('pop')
    }
    await animate(band, [pose(1), pose(1, 0)], { duration: 360, easing: 'ease-in' })
    if (!handOff || !from) return
    await wait(300)
    play('peel')
    const to = handOff.to()
    await animate(
      handOff.float,
      [
        { width: `${from.width}px`, transform: at(from.x, from.y, 1, from.angle) },
        {
          width: `${(from.width + to.width) / 2}px`,
          transform: at((from.x + to.x) / 2, Math.min(from.y, to.y) - 50, 1, (from.angle + to.angle) / 2 + 10),
          offset: 0.45,
        },
        { width: `${to.width}px`, transform: at(to.x, to.y, 1, to.angle) },
      ],
      { duration: 600, easing: 'cubic-bezier(.5, 0, .3, 1)' },
    )
  })
}

/** Big enough to read as the board's picture lifting off, without blowing up the sticker's border. */
const popScale = (board: DOMRect, width: number) => Math.min(board.width * 0.7, 220) / width

/** A replay's re-solve: the sticker pops out of the board and settles back into it. */
export function popOnly(el: HTMLElement, board: DOMRect): Choreography {
  const [x, y] = center(board)
  const s = popScale(board, el.offsetWidth)
  return run(async animate => {
    play('pop')
    await animate(
      el,
      [{ transform: at(x, y, 0, -20) }, { transform: at(x, y, s * 1.14, -4), offset: 0.6 }, { transform: at(x, y, s, -8) }],
      { duration: 420, easing: 'cubic-bezier(.3, 1.6, .5, 1)' },
    )
    await animate(
      el,
      [-8, 5, -5, 2, -8].map(r => ({ transform: at(x, y, s, r) })),
      { duration: 520 },
    )
    await animate(
      el,
      [
        { transform: at(x, y, s, -8), opacity: 1 },
        { transform: at(x, y, s * 0.6, 0), opacity: 0 },
      ],
      { duration: 280, easing: 'ease-in' },
    )
  })
}
