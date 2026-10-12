import { Sticker, StickerBack, tiltOf } from '../album/Sticker.tsx'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import type { StickerEntry } from '../campaign/stickers.ts'
import { dailyDateOf } from '../daily/clock.ts'
import styles from './Showcase.module.css'

/** The showcase's stickers on the cover, biggest first. */
const SPOTS = [
  { tilt: -4, width: '38%' },
  { tilt: 5, width: '28%' },
  { tilt: -2, width: '28%' },
]

/** A player's showcase on cobalt, tilted and biggest first; dashed spaces where a newcomer's will go. */
export function Showcase({ stickers, className }: { stickers: readonly StickerEntry[]; className?: string | undefined }) {
  const classes = [styles.showcase, className].filter(Boolean).join(' ')
  if (stickers.length === 0) {
    return (
      <ul className={classes} aria-hidden="true">
        {SPOTS.map(({ width }, i) => (
          <li key={i} style={{ width }}>
            <span className={styles.empty} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <ul className={classes} aria-label="Showcase">
      {stickers.slice(0, SPOTS.length).map((s, i) => (
        <li key={s.puzzle.id} style={{ width: SPOTS[i]!.width }}>
          <ProfileSticker sticker={s} tilt={SPOTS[i]!.tilt} />
        </li>
      ))}
    </ul>
  )
}

/** Their sticker, face down unless the viewer has collected it too. */
export function ProfileSticker({ sticker: s, tilt }: { sticker: StickerEntry; tilt?: number }) {
  const { puzzle } = s
  const lean = tilt ?? tiltOf(puzzle.id)
  if (!s.palette) {
    return (
      <span role="img" aria-label={`#${s.number}, a sticker you haven't collected`} className={styles.fill}>
        <StickerBack width={puzzle.width} height={puzzle.height} tilt={lean} />
      </span>
    )
  }
  return (
    <Sticker
      title={puzzle.title}
      width={puzzle.width}
      height={puzzle.height}
      palette={s.palette}
      foil={s.foil}
      gold={s.number === GOLD_SLOT && dailyDateOf(puzzle.id) === null}
      tilt={lean}
    />
  )
}
