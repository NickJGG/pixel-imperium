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
import { FADE } from './map-geometry.ts'
import { cropStart, fadesOf, journeyHeight, paintJourney } from './journey-paint.ts'
import { type CampaignProgress, isOpen } from './progress.ts'
import styles from './Journey.module.css'

/** Phones show only the middle two-thirds of the Journey. */
const PHONE = '(max-width: 760px)'
/** The least gap, in px, between a label and the Journey's edge. */
const LABEL_INSET = 4

interface Props {
  campaign: Campaign
  /** Must keep its identity across renders; a new object repaints. */
  progress: CampaignProgress
  /** The Journey as it stood before the latest conquests; `onSwept` fires once they've been shown. */
  from?: CampaignProgress | undefined
  onSwept?: () => void
  /** Clicking an open province opens it; off for someone else's Journey. */
  linked?: boolean
  /** The last province shown, by index; the Journey ends at the foot of its Map. */
  cutAfter?: number | undefined
  /** Shown over the Journey's foot. */
  children?: ReactNode
}

export function Journey({ campaign, progress, from, onSwept, linked = false, cutAfter, children }: Props) {
  const { journey, provinces } = campaign
  const { width, height, step, maps } = journey
  const phoneCols = Math.round((width * 2) / 3)
  const [cols, setCols] = useState(() => (matchMedia(PHONE).matches ? phoneCols : width))
  const rows = cutAfter === undefined ? journeyHeight(journey) : cutAfter * step + height
  const shown = cutAfter === undefined ? maps.length : cutAfter + 1
  const x0 = cropStart(journey, cols)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const overlayRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const finish = useEffectEvent(() => onSwept?.())

  useEffect(() => {
    const query = matchMedia(PHONE)
    const update = () => setCols(query.matches ? phoneCols : width)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [phoneCols, width])

  useEffect(() => {
    const ctx = canvasRef.current!.getContext('2d')
    if (!ctx) return
    ctx.putImageData(new ImageData(paintJourney(journey, progress, { cols, rows }), cols, rows), 0, 0)
    if (from) finish()
  }, [journey, progress, from, cols, rows])

  // Labels centre above their Landmark, which can sit near the Journey's edge; slide them back inside.
  // Re-measured on every render, as a label's width changes with its count and the font loading.
  useLayoutEffect(() => {
    const overlay = overlayRef.current!
    const labels = [...overlay.querySelectorAll<HTMLElement>('[data-anchor]')]
    const fit = () => {
      const { clientWidth: w, clientHeight: h } = overlay
      const place = (at: number, size: number, max: number) =>
        Math.max(size / 2 + LABEL_INSET, Math.min(at, max - size / 2 - LABEL_INSET))
      for (const label of labels) {
        const [x, y] = label.dataset.anchor!.split(' ').map(Number)
        const { offsetWidth: lw, offsetHeight: lh } = label
        label.style.left = `${place((x! / cols) * w, lw, w)}px`
        label.style.top = `${place((y! / rows) * h - lh, lh, h)}px`
      }
    }
    fit()
    const observer = new ResizeObserver(fit)
    for (const el of [overlay, ...labels]) observer.observe(el)
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
        <div ref={overlayRef} className={styles.overlay} aria-hidden="true">
          {provinces.slice(0, shown).map((province, i) => {
            const { state, solved, total } = progress.provinces[i]!
            const { landmark } = maps[i]!
            const label = {
              className: styles.label,
              'data-state': state,
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
