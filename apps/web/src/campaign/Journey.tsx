import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { Campaign } from '@pixel-imperium/protocol'
import { Stamp } from '../album/Stamp.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { play } from '../sound.ts'
import { FADE } from './map-geometry.ts'
import { type ConquestAnim, cropStart, fadesOf, journeyHeight, paintJourney } from './journey-paint.ts'
import { type CampaignProgress, isOpen } from './progress.ts'
import type { CrestArt } from './stickers.ts'
import styles from './Journey.module.css'

/** Phones show only the middle two-thirds of the Journey. */
const PHONE = '(max-width: 760px)'
/** The least gap, in px, between a label and the Journey's edge. */
const LABEL_INSET = 4
const BEAT_MS = { scroll: 700, stamp: 700, crest: 650, sweep: 1300, march: 1000, reveal: 600, shimmer: 1600 }
/** Where the "complete" stamp lands, across the Journey, level with the province's Landmark. */
const STAMP_X = 0.8
/** Where a conquered Map's foot settles before its conquest plays, as a fraction of the viewport. */
const CONQUEST_AT = 0.45

/** How many of a `width`-wide picture's middle columns fit the screen. */
function useCols(width: number): number {
  const phoneCols = Math.round((width * 2) / 3)
  const [cols, setCols] = useState(() => (matchMedia(PHONE).matches ? phoneCols : width))
  useEffect(() => {
    const query = matchMedia(PHONE)
    const update = () => setCols(query.matches ? phoneCols : width)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [phoneCols, width])
  return cols
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function scrollerOf(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(p).overflowY)) return p
  }
  return document.scrollingElement as HTMLElement
}

interface Props {
  campaign: Campaign
  /** Must keep its identity across renders; a new object repaints. */
  progress: CampaignProgress
  /**
   * The Journey before each conquest not yet shown, oldest first; they play once, in order, then
   * `onSwept` fires.
   */
  from?: readonly CampaignProgress[] | undefined
  onSwept?: () => void
  /** Clicking an open province opens it; off for someone else's Journey. */
  linked?: boolean
  /** The last province shown, by index; the Journey ends at the foot of its Map. */
  cutAfter?: number | undefined
  /** Each province's Crest by index, stuck on its Landmark once it's conquered; `null` leaves it bare. */
  crests?: readonly (CrestArt | null)[] | undefined
  /** Laid over the Journey, such as the conquest banner; it places itself, in Journey rows via `--h`. */
  children?: ReactNode
}

const conqueredIn = (progress: CampaignProgress) =>
  new Set(progress.provinces.flatMap((p, i) => (p.state === 'conquered' ? [i] : [])))

export function Journey({ campaign, progress, from, onSwept, linked = false, cutAfter, crests, children }: Props) {
  const { journey, provinces } = campaign
  const { width, height, step, maps } = journey
  const cols = useCols(width)
  const rows = cutAfter === undefined ? journeyHeight(journey) : cutAfter * step + height
  const shown = cutAfter === undefined ? maps.length : cutAfter + 1
  const x0 = cropStart(journey, cols)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const pinsRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(() => from !== undefined && !reducedMotion())
  // While a conquest plays, the Crests stuck on so far and the one slamming down; else every conquered one.
  const [crested, setCrested] = useState<{ shown: ReadonlySet<number>; slam?: number } | null>(() =>
    playing ? { shown: conqueredIn(from![0]!) } : null,
  )
  const [stamped, setStamped] = useState<number | null>(null)
  // What the canvas shows while a conquest plays; the animation mutates it frame by frame.
  const frame = useRef<{ progress: CampaignProgress; anim?: ConquestAnim } | null>(
    playing ? { progress: from![0]! } : null,
  )
  const navigate = useNavigate()

  const draw = useEffectEvent(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    const { progress: shownProgress, anim } = frame.current ?? { progress }
    ctx.putImageData(new ImageData(paintJourney(journey, shownProgress, { cols, rows, anim }), cols, rows), 0, 0)
  })
  const finish = useEffectEvent(() => onSwept?.())
  const hasCrest = useEffectEvent((i: number) => Boolean(crests?.[i]))

  useEffect(() => draw(), [journey, progress, cols, rows])

  useEffect(() => {
    if (!from) return
    if (reducedMotion()) {
      finish()
      return
    }
    let cancelled = false
    let raf = 0
    let timer = 0
    const wait = (ms: number) => new Promise<void>(resolve => (timer = window.setTimeout(resolve, ms)))
    const tween = (ms: number, set: (k: number) => void) =>
      new Promise<void>(resolve => {
        let t0: number | undefined
        const tick = (now: number) => {
          t0 ??= now
          const k = Math.min(1, (now - t0) / ms)
          set(k)
          draw()
          if (k < 1) raf = requestAnimationFrame(tick)
          else resolve()
        }
        raf = requestAnimationFrame(tick)
      })
    const easeInOut = (k: number) => (k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2)

    /** Brings Map `c`'s foot a little above the middle of the screen. */
    const scrollTo = async (c: number) => {
      const canvas = canvasRef.current!
      const scroller = scrollerOf(canvas)
      const rect = canvas.getBoundingClientRect()
      const view = scroller === document.scrollingElement ? 0 : scroller.getBoundingClientRect().top
      const foot = rect.top + ((c * step + height) / rows) * rect.height - view
      const by = foot - scroller.clientHeight * CONQUEST_AT
      if (Math.abs(by) < 8) return
      scroller.scrollTo({ top: scroller.scrollTop + by, behavior: 'smooth' })
      await wait(BEAT_MS.scroll)
    }

    const history = [...from, progress]
    frame.current = { progress: history[0]! }
    draw()
    void (async () => {
      for (let k = 0; k < from.length && !cancelled; k++) {
        const [before, after] = [history[k]!, history[k + 1]!]
        const c = after.provinces.findIndex(
          (p, i) => p.state === 'conquered' && before.provinces[i]!.state !== 'conquered',
        )
        await scrollTo(c)
        if (cancelled) return
        setStamped(c)
        play('press')
        await wait(BEAT_MS.stamp)
        if (cancelled) return
        if (hasCrest(c)) {
          setCrested(was => ({ shown: new Set([...(was?.shown ?? []), c]), slam: c }))
          play('thunk')
          await wait(BEAT_MS.crest)
          if (cancelled) return
        }
        const anim: ConquestAnim = { from: before, c, sweep: 0, march: 0, reveal: 0, shimmer: 0 }
        frame.current = { progress: after, anim }
        await tween(BEAT_MS.sweep, t => (anim.sweep = t))
        if (c + 1 < maps.length) {
          await tween(BEAT_MS.march, t => (anim.march = easeInOut(t)))
          await tween(BEAT_MS.reveal, t => (anim.reveal = t))
        }
        if (after.conquered && k === from.length - 1) {
          play('chime')
          await tween(BEAT_MS.shimmer, t => (anim.shimmer = t))
        }
      }
      if (cancelled) return
      frame.current = null
      draw()
      setPlaying(false)
      setCrested(null)
      setStamped(null)
      finish()
    })()
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [from, progress, maps.length, step, height, rows])

  // Labels centre above their Landmark, and above its Crest; pins (Crests, the stamp) centre on their
  // anchor. Either can sit near the Journey's edge; slide them back inside. Re-measured on every render,
  // as a label's width changes with its count and the font loading.
  useLayoutEffect(() => {
    const overlay = overlayRef.current!
    const pinned = [...pinsRef.current!.querySelectorAll<HTMLElement>('[data-anchor]')]
    const labels = [...overlay.querySelectorAll<HTMLElement>('[data-anchor]')]
    const fit = () => {
      const { clientWidth: w, clientHeight: h } = overlay
      const place = (at: number, size: number, max: number) =>
        Math.max(size / 2 + LABEL_INSET, Math.min(at, max - size / 2 - LABEL_INSET))
      const crestHeight = new Map<string, number>()
      for (const el of [...pinned, ...labels]) {
        const [x, y] = el.dataset.anchor!.split(' ').map(Number)
        const { offsetWidth: ew, offsetHeight: eh } = el
        const crest = el.dataset.crest
        if (crest !== undefined) crestHeight.set(crest, eh)
        const crestUnder = crestHeight.get(el.dataset.province!) ?? 0
        const lift = el.parentElement === overlay ? Math.max(eh, (eh + crestUnder) / 2) : 0
        el.style.left = `${place((x! / cols) * w, ew, w)}px`
        el.style.top = `${place((y! / rows) * h - lift, eh, h)}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    for (const el of [overlay, ...pinned, ...labels]) observer.observe(el)
    return () => observer.disconnect()
  })

  /** The province drawn on top at the pointer, if it's open; Maps lower down lie over the ones above. */
  const openAt = (e: MouseEvent): number | null => {
    if (!linked) return null
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * cols) + x0
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * rows)
    if (y < 0 || y >= rows) return null
    const fades = fadesOf(journey, cols)
    for (let i = shown - 1; i >= 0; i--) {
      const my = y - i * step
      if (my < 0 || my >= height || x < 0 || x >= width || fades[i]![my * width + x]! < 0.5) continue
      return isOpen(progress.provinces[i]!.state) ? i : null
    }
    return null
  }

  return (
    <div className={styles.journey} style={{ '--w': cols, '--h': rows, '--fade': FADE } as CSSProperties}>
      <div
        className={styles.frame}
        onClick={e => {
          const i = openAt(e)
          if (i !== null) {
            void navigate({
              to: '/c/$campaignId/$provinceId',
              params: { campaignId: campaign.id, provinceId: provinces[i]!.id },
            })
          }
        }}
        onPointerMove={e => (e.currentTarget.style.cursor = openAt(e) === null ? '' : 'pointer')}
      >
        <canvas
          ref={canvasRef}
          width={cols}
          height={rows}
          className={styles.canvas}
          role="img"
          aria-label={`Map of ${campaign.name}`}
        />
        <div ref={pinsRef} className={styles.pins} aria-hidden="true">
          {provinces.slice(0, shown).map((province, i) => {
            const art = crests?.[i]
            const stuck = crested ? crested.shown.has(i) : progress.provinces[i]!.state === 'conquered'
            if (!art || !stuck) return null
            const { landmark } = maps[i]!
            return (
              <span
                key={province.id}
                className={[styles.crest, crested?.slam === i && styles.slam].filter(Boolean).join(' ')}
                data-anchor={`${landmark.x - x0 + 0.5} ${i * step + landmark.y + 0.5}`}
                data-crest={i}
              >
                <Sticker {...art} gold round tilt={tiltOf(province.id) * 2} />
              </span>
            )
          })}
          {stamped !== null && (
            <span className={styles.stamp} data-anchor={`${cols * STAMP_X} ${stamped * step + maps[stamped]!.landmark.y}`}>
              <Stamp thunk solid>
                {provinces[stamped]!.name} complete
              </Stamp>
            </span>
          )}
        </div>
        <div ref={overlayRef} className={styles.overlay} data-hidden={playing || undefined} aria-hidden="true">
          {provinces.slice(0, shown).map((province, i) => {
            const { state, solved, total } = progress.provinces[i]!
            const { landmark } = maps[i]!
            const label = {
              className: styles.label,
              'data-state': state,
              'data-province': i,
              'data-anchor': `${landmark.x - x0 + 0.5} ${i * step + landmark.y + 0.5}`,
            }
            const content = (
              <>
                {state === 'conquered' && '✓ '}
                {state === 'locked' ? 'Unknown province' : province.name}
                {state === 'active' && (
                  <span className={styles.count}>
                    {solved}/{total}
                  </span>
                )}
              </>
            )
            // Out of the tab order: keyboard users reach the province through the list below.
            return linked && isOpen(state) ? (
              <Link
                key={province.id}
                {...label}
                to="/c/$campaignId/$provinceId"
                params={{ campaignId: campaign.id, provinceId: province.id }}
                tabIndex={-1}
                onClick={e => e.stopPropagation()}
              >
                {content}
                {state === 'active' && (
                  <svg className={styles.go} viewBox="0 0 8 8">
                    <path d="M2 1l4 3-4 3z" />
                  </svg>
                )}
              </Link>
            ) : (
              <span key={province.id} {...label}>
                {content}
              </span>
            )
          })}
        </div>
        {children}
      </div>
      <div className={styles.list}>
        <ProvinceList campaign={campaign} progress={progress} linked={linked} />
      </div>
    </div>
  )
}

const STATE_LABEL = { locked: 'Locked', next: 'Next', active: 'Active', conquered: 'Conquered' }

/** The Journey in words, for screen readers; a locked province stays unnamed, as it is fogged on the map. */
function ProvinceList({ campaign, progress, linked }: { campaign: Campaign; progress: CampaignProgress; linked: boolean }) {
  return (
    <ol>
      {campaign.provinces.map((province, i) => {
        const { state, solved, total } = progress.provinces[i]!
        const name = state === 'locked' ? 'Unknown province' : province.name
        return (
          <li key={province.id}>
            {linked && isOpen(state) ? (
              <Link to="/c/$campaignId/$provinceId" params={{ campaignId: campaign.id, provinceId: province.id }}>
                {name}
              </Link>
            ) : (
              name
            )}
            {`: ${STATE_LABEL[state]}`}
            {state === 'active' && `, ${solved} of ${total} solved`}
          </li>
        )
      })}
    </ol>
  )
}
