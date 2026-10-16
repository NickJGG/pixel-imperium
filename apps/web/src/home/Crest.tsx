import { useEffect, useState } from 'react'
import { landing } from './crest.ts'
import styles from './Home.module.css'

/** Cells on a pitch with gaps between them, in SVG units, and headroom above for the sticker hovering on top. */
const PITCH = 12
const CELL = 10
const MARGIN = 4
const HEADROOM = 14

const BLANK_WIDTH = 10
const BLANK_HEIGHT = 6

const box = (width: number, height: number) => ({ w: width * PITCH + 2 * MARGIN, h: height * PITCH + 2 * MARGIN })
const viewBox = (width: number, height: number) => {
  const { w, h } = box(width, height)
  return `0 ${-HEADROOM} ${w} ${h + HEADROOM}`
}
const cellAt = (i: number, width: number) => ({
  x: MARGIN + (i % width) * PITCH + 1,
  y: MARGIN + Math.floor(i / width) * PITCH + 1,
  width: CELL,
  height: CELL,
})

/** Where each campaign's sticker hovered when Home last showed it, so it can drop in once its puzzle is solved. */
const hovered = new Map<string, number | null>()

/**
 * The Crest: one pixel per puzzle, a blank nonogram cell until its puzzle is solved. A blank sticker hovers over the
 * pixel Continue's puzzle will reveal; back from solving it, that sticker drops into place before the next appears.
 */
export function Crest({
  campaignId,
  width,
  height,
  pixels,
  marker,
}: {
  campaignId: string
  width: number
  height: number
  /** From `crestPixels`. */
  pixels: readonly (string | null | undefined)[]
  /** The pixel the sticker hovers over, `null` once the campaign is conquered. */
  marker: number | null
}) {
  const [landed] = useState(() => landing(hovered.get(campaignId) ?? null, marker, pixels))
  useEffect(() => {
    hovered.set(campaignId, marker)
  }, [campaignId, marker])

  const { w, h } = box(width, height)
  const cell = (i: number) => cellAt(i, width)
  const revealed = pixels.filter(p => p != null).length
  const total = pixels.filter(p => p !== undefined).length

  return (
    <svg
      className={styles.crest}
      viewBox={viewBox(width, height)}
      role="img"
      aria-label={`The Crest, ${revealed} of ${total} pixels revealed`}
    >
      <rect className={styles.crestBack} width={w} height={h} rx={6} />
      {pixels.map((color, i) =>
        color === undefined ? null : color === null ? (
          <rect key={i} {...cell(i)} rx={1} className={styles.blank} />
        ) : (
          <rect key={i} {...cell(i)} rx={1} fill={color} />
        ),
      )}
      {landed !== null && <rect {...cell(landed)} rx={1.5} className={styles.sticker} data-landing />}
      {marker !== null && (
        <rect {...cell(marker)} rx={1.5} className={styles.sticker} data-hover data-late={landed !== null || undefined} />
      )}
    </svg>
  )
}

/** A campaign's Crest before it has one: a fixed grid of blank pixels. */
export function BlankCrest() {
  const { w, h } = box(BLANK_WIDTH, BLANK_HEIGHT)
  return (
    <svg className={styles.crest} viewBox={viewBox(BLANK_WIDTH, BLANK_HEIGHT)} role="img" aria-label="No crest yet">
      <rect className={styles.crestBack} width={w} height={h} rx={6} />
      {Array.from({ length: BLANK_WIDTH * BLANK_HEIGHT }, (_, i) => (
        <rect key={i} {...cellAt(i, BLANK_WIDTH)} rx={1} className={styles.blank} />
      ))}
    </svg>
  )
}
