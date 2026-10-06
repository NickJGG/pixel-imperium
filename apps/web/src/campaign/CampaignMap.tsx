import { type CSSProperties, type MouseEvent, type ReactNode, useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { Campaign } from '@pixel-imperium/protocol'
import { mapGeometry } from './map-geometry.ts'
import { type Pixels, paint } from './map-paint.ts'
import { type CampaignProgress, isOpen } from './progress.ts'
import styles from './CampaignMap.module.css'

/** The conquered provinces sweep outward over this long, then the rest of the map settles. */
const SWEEP_MS = 1200
const SETTLE_MS = 500
const CELL_MS = 150
const FADE_MS = 300

interface Props {
  campaign: Campaign
  /** Must keep its identity across renders; a new object repaints, and restarts a sweep. */
  progress: CampaignProgress
  /** The map as it stood before the latest conquests; it sweeps into `progress` once, on mount. */
  from?: CampaignProgress | undefined
  onSwept?: () => void
  /** Clicking an open province opens it; off for someone else's map. */
  linked?: boolean
  /** Shown over the map's foot. */
  children?: ReactNode
}

export function CampaignMap({ campaign, progress, from, onSwept, linked = false, children }: Props) {
  const { map, provinces } = campaign
  const geometry = useMemo(() => mapGeometry(map, provinces.length), [map, provinces.length])
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [sweeping, setSweeping] = useState(from !== undefined)
  const navigate = useNavigate()
  const finish = useEffectEvent(() => {
    setSweeping(false)
    onSwept?.()
  })

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')
    if (!ctx) return
    const put = (pixels: Pixels) =>
      ctx.putImageData(new ImageData(pixels, map.width, map.height), 0, 0)
    const target = paint(map, progress)
    if (!from || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      put(target)
      if (from) finish()
      return
    }

    const start = paint(map, from)
    const changed: { i: number; delay: number; duration: number }[] = []
    for (let i = 0; i < map.colors.length; i++) {
      const o = i * 4
      if ([0, 1, 2, 3].every(c => start[o + c] === target[o + c])) continue
      const r = map.regions[i]!
      const conquest =
        r !== null && from.provinces[r]!.state !== 'conquered' && progress.provinces[r]!.state === 'conquered'
      changed.push(
        conquest
          ? { i, delay: geometry.reach[i]! * SWEEP_MS, duration: CELL_MS }
          : { i, delay: SWEEP_MS + geometry.reach[i]! * SETTLE_MS, duration: FADE_MS },
      )
    }

    const frame = new Uint8ClampedArray(start)
    let t0: number | undefined
    let raf = 0
    const tick = (now: number) => {
      t0 ??= now
      let done = true
      for (const { i, delay, duration } of changed) {
        const k = Math.min(1, Math.max(0, (now - t0 - delay) / duration))
        if (k < 1) done = false
        for (let c = i * 4; c < i * 4 + 4; c++) frame[c] = start[c]! + (target[c]! - start[c]!) * k
      }
      put(frame)
      if (done) finish()
      else raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [map, geometry, progress, from])

  const openAt = (e: MouseEvent): number | null => {
    if (!linked) return null
    const rect = canvasRef.current!.getBoundingClientRect()
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * map.width)
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * map.height)
    if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null
    const r = map.regions[y * map.width + x]!
    return r !== null && isOpen(progress.provinces[r]!.state) ? r : null
  }

  const marked = provinces.flatMap((province, i) => {
    const { state, solved, total } = progress.provinces[i]!
    return state === 'active' || state === 'next' ? [{ province, state, solved, total, ...geometry.regions[i]! }] : []
  })

  return (
    <div className={styles.map} style={{ '--w': map.width, '--h': map.height } as CSSProperties}>
      <div
        className={styles.frame}
        onClick={e => {
          const r = openAt(e)
          if (r !== null) {
            void navigate({
              to: '/c/$campaignId/$provinceId',
              params: { campaignId: campaign.id, provinceId: provinces[r]!.id },
            })
          }
        }}
        onPointerMove={e => (e.currentTarget.style.cursor = openAt(e) === null ? '' : 'pointer')}
      >
        <canvas
          ref={canvasRef}
          width={map.width}
          height={map.height}
          className={styles.canvas}
          role="img"
          aria-label={`Map of ${campaign.name}`}
        />
        <div className={styles.overlay} data-hidden={sweeping || undefined} aria-hidden="true">
          <svg viewBox={`0 0 ${map.width} ${map.height}`} preserveAspectRatio="none">
            {marked.map(m => (
              <path key={m.province.id} d={m.outline} data-state={m.state} />
            ))}
          </svg>
          {marked.map(m => (
            <span
              key={m.province.id}
              className={styles.label}
              data-state={m.state}
              style={{ left: `${(m.anchor.x / map.width) * 100}%`, top: `${(m.anchor.y / map.height) * 100}%` }}
            >
              {m.province.name}
              {m.state === 'active' && (
                <span className={styles.count}>
                  {m.solved}/{m.total}
                </span>
              )}
            </span>
          ))}
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

/** The map in words, for screen readers; a locked province stays unnamed, as it is fogged on the map. */
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
