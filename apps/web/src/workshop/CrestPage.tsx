/**
 * A draft campaign's Crest, drawn like a puzzle: paint pixels in its colors or leave holes, then give each filled
 * pixel to a province in Regions mode, by hand or with Auto (reading order, province 1 first). It fits once it has a
 * pixel per puzzle and each province's region one per its puzzle; until then it only warns, and publishing leaves it off.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from 'react'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { CheckIcon, CrossIcon } from '../album/icons.tsx'
import { FIRST_PICK } from '../make/PublishSheet.tsx'
import { useHudTrail } from '../Trail.tsx'
import { crestTrail } from '../trails.ts'
import {
  MAX_CREST_COLORS,
  MAX_CREST_SIDE,
  autoRegions,
  blankCrest,
  crestFit,
  crestWidth,
  keyFor,
  paintCrest,
  paintRegion,
  provinceName,
  regionCounts,
  resizeCrest,
} from './campaign-draft.ts'
import { type CampaignKey, type StoredCampaign, editCampaign, flushOnLeave, openCampaign, useCampaign } from './campaign-store.ts'
import { titleOf } from './workshop.ts'
import home from '../home/Home.module.css'
import own from './Workshop.module.css'
import styles from './Builder.module.css'

/** One per province, apart from each other whatever papers the provinces have. */
export const REGION_COLORS = ['#e4572e', '#2a9d8f', '#f3a712', '#6c5ce7', '#8cb83c', '#d64d9b']

type Mode = 'picture' | 'regions'

export function CrestPage({ draftKey, opening }: { draftKey: CampaignKey; opening: StoredCampaign }) {
  useState(() => openCampaign(draftKey, opening))
  useEffect(flushOnLeave, [])
  const { doc } = useCampaign() ?? opening
  const navigate = useNavigate()
  useHudTrail(crestTrail(draftKey.id, doc))
  const [mode, setMode] = useState<Mode>('picture')
  const [color, setColor] = useState<string | null>(() => Object.keys(doc.crest?.palette ?? {})[0] ?? null)
  const [region, setRegion] = useState(0)
  const counts = doc.provinces.map(p => p.puzzleIds.length)
  const crest = doc.crest

  if (!crest) {
    return (
      <main className={own.page}>
        <Worlds>
          <World paper={doc.paper ?? 'workshop'} labelledBy="crest-title" start>
            <div className={styles.crestPage}>
              <p className={home.kicker}>{titleOf(doc.title)} · draft</p>
              <h1 id="crest-title" className={home.hero}>
                No crest
              </h1>
              <p className={home.line}>A Crest is optional: one pixel per puzzle, each revealed as its puzzle is solved.</p>
              <div className={home.actions}>
                <button
                  type="button"
                  data-variant="primary"
                  onClick={() => editCampaign(d => ({ ...d, crest: blankCrest(counts, d.paper ?? FIRST_PICK) }))}
                >
                  Add a crest
                </button>
              </div>
            </div>
          </World>
        </Worlds>
      </main>
    )
  }

  const width = crestWidth(crest)
  const height = crest.rows.length
  const total = counts.reduce((a, b) => a + b, 0)
  const fit = crestFit(crest, counts)
  const have = regionCounts(crest, counts.length)
  const palette = Object.entries(crest.palette)
  const key = color !== null && color in crest.palette ? color : null

  const paint = (index: number, erase: boolean) =>
    editCampaign(d => {
      if (!d.crest) return d
      if (mode === 'regions') return erase ? d : { ...d, crest: paintRegion(d.crest, index, Math.min(region, counts.length - 1)) }
      return { ...d, crest: paintCrest(d.crest, index, erase ? null : key, counts) }
    })
  const addColor = (hex: string) => {
    const added = keyFor(crest, hex)
    if (!added) return
    editCampaign(d => ({ ...d, crest: added.crest }))
    setColor(added.key)
  }
  const removeCrest = () => {
    if (!confirm('Remove the crest? The campaign works without one.')) return
    editCampaign(d => ({ ...d, crest: null }))
    void navigate({ to: '/workshop', search: { open: draftKey.id }, replace: true })
  }

  return (
    <main className={own.page}>
      <Worlds>
        <World paper={doc.paper ?? 'workshop'} labelledBy="crest-title" start>
          <div className={styles.crestPage}>
            <div className={styles.crestStage}>
              <CrestGrid
                rows={crest.rows}
                regions={crest.regions}
                palette={crest.palette}
                width={width}
                height={height}
                mode={mode}
                onPaint={paint}
              />
            </div>
            <aside className={styles.crestRail}>
              <p className={home.kicker}>{titleOf(doc.title)} · crest</p>
              <h1 id="crest-title" className={home.hero}>
                Crest
              </h1>
              <p className={styles.fit} data-ok={fit.fits} role="status">
                {fit.fits ? <CheckIcon /> : <CrossIcon />}
                {fit.pixels} / {total} pixels
              </p>
              {!fit.fits && (
                <p className={home.sub}>
                  {fit.pixels !== total
                    ? `It needs one filled pixel per puzzle: ${total}.`
                    : 'Each province’s region needs one pixel per puzzle in it.'}{' '}
                  Until it fits, publishing leaves it off.
                </p>
              )}
              <span className={own.seg} role="group" aria-label="Paint">
                {(['picture', 'regions'] as const).map(m => (
                  <button
                    key={m}
                    type="button"
                    data-variant="flat"
                    data-size="compact"
                    aria-pressed={mode === m}
                    disabled={m === 'regions' && counts.length === 0}
                    onClick={() => setMode(m)}
                  >
                    {m === 'picture' ? 'Picture' : 'Regions'}
                  </button>
                ))}
              </span>
              {mode === 'picture' ? (
                <div className={styles.chips} role="group" aria-label="Colors">
                  <button
                    type="button"
                    className={styles.chip}
                    data-hole
                    aria-pressed={key === null}
                    aria-label="Hole"
                    title="Hole: no pixel"
                    onClick={() => setColor(null)}
                  />
                  {palette.map(([k, hex]) => (
                    <button
                      key={k}
                      type="button"
                      className={styles.chip}
                      style={{ '--c': hex } as CSSProperties}
                      aria-pressed={key === k}
                      aria-label={`Color ${hex}`}
                      onClick={() => setColor(k)}
                    />
                  ))}
                  {palette.length < MAX_CREST_COLORS && (
                    <label className={`${styles.chip} ${styles.addChip}`} title="Add a color">
                      +
                      <input type="color" aria-label="Add a color" onChange={e => addColor(e.target.value.toLowerCase())} />
                    </label>
                  )}
                </div>
              ) : (
                <>
                  <ul className={styles.regions} aria-label="Provinces">
                    {doc.provinces.map((p, k) => (
                      <li key={k}>
                        <button
                          type="button"
                          aria-pressed={region === k}
                          style={{ '--c': REGION_COLORS[k] } as CSSProperties}
                          data-ok={have[k] === counts[k]}
                          onClick={() => setRegion(k)}
                        >
                          <i aria-hidden="true" />
                          {provinceName(doc, k)}
                          <small>
                            {have[k]} / {counts[k]}
                          </small>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    data-variant="paper"
                    data-size="compact"
                    title="Give the pixels to provinces in reading order, province 1 first"
                    onClick={() => editCampaign(d => (d.crest ? { ...d, crest: autoRegions(d.crest, counts) } : d))}
                  >
                    Auto
                  </button>
                </>
              )}
              <div className={styles.sizeRow}>
                <Stepper
                  label="W"
                  value={width}
                  onStep={dir => editCampaign(d => (d.crest ? { ...d, crest: resizeCrest(d.crest, clampSide(width + dir), height) } : d))}
                />
                <Stepper
                  label="H"
                  value={height}
                  onStep={dir => editCampaign(d => (d.crest ? { ...d, crest: resizeCrest(d.crest, width, clampSide(height + dir)) } : d))}
                />
              </div>
              <p className={home.sub}>Left drag paints, right drag {mode === 'picture' ? 'leaves holes' : 'does nothing'}.</p>
              <div className={home.actions}>
                <Link to="/workshop" search={{ open: draftKey.id }} data-variant="primary">
                  Done
                </Link>
                <button type="button" data-variant="paper" onClick={removeCrest}>
                  Remove crest
                </button>
              </div>
            </aside>
          </div>
        </World>
      </Worlds>
    </main>
  )
}

const clampSide = (n: number) => Math.min(MAX_CREST_SIDE, Math.max(1, n))

function Stepper({ label, value, onStep }: { label: string; value: number; onStep: (dir: 1 | -1) => void }) {
  return (
    <span className={styles.stepper}>
      <span>{label}</span>
      <button type="button" data-size="compact" aria-label={`${label} smaller`} onClick={() => onStep(-1)}>
        −
      </button>
      <b>{value}</b>
      <button type="button" data-size="compact" aria-label={`${label} larger`} onClick={() => onStep(1)}>
        +
      </button>
    </span>
  )
}

/** The crest's pixels, painted by dragging: in their colors, or in Regions mode their provinces'. */
function CrestGrid({
  rows,
  regions,
  palette,
  width,
  height,
  mode,
  onPaint,
}: {
  rows: readonly string[]
  regions: readonly string[]
  palette: Record<string, string>
  width: number
  height: number
  mode: Mode
  onPaint: (index: number, erase: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const stroke = useRef<{ erase: boolean; last: number } | null>(null)
  const at = (e: PointerEvent) => {
    const box = ref.current!.getBoundingClientRect()
    const x = Math.floor(((e.clientX - box.left) / box.width) * width)
    const y = Math.floor(((e.clientY - box.top) / box.height) * height)
    return x >= 0 && x < width && y >= 0 && y < height ? y * width + x : -1
  }
  const paintAt = (e: PointerEvent) => {
    const s = stroke.current
    const i = at(e)
    if (!s || i === -1 || i === s.last) return
    s.last = i
    onPaint(i, s.erase)
  }
  return (
    <div
      ref={ref}
      className={styles.crestGrid}
      style={{ '--w': width, '--h': height } as CSSProperties}
      role="img"
      aria-label={`The crest, ${width} by ${height}`}
      onContextMenu={e => e.preventDefault()}
      onPointerDown={e => {
        if (e.button !== 0 && e.button !== 2) return
        e.currentTarget.setPointerCapture(e.pointerId)
        stroke.current = { erase: e.button === 2, last: -1 }
        paintAt(e)
      }}
      onPointerMove={paintAt}
      onPointerUp={() => (stroke.current = null)}
      onPointerCancel={() => (stroke.current = null)}
    >
      {rows.flatMap((row, y) =>
        [...row].map((ch, x) => {
          const region = regions[y]?.[x] ?? '.'
          const color = mode === 'picture' ? palette[ch] : REGION_COLORS[Number(region) - 1]
          return (
            <i
              key={y * width + x}
              data-hole={ch === '.' || undefined}
              style={color ? ({ '--c': color } as CSSProperties) : undefined}
            />
          )
        }),
      )}
    </div>
  )
}
