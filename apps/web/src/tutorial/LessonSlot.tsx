import { Slot } from '../album/Slot.tsx'
import { PixelArt } from '../campaign/PixelArt.tsx'
import type { LessonPuzzle } from './lessons.ts'
import styles from './Learn.module.css'

/**
 * A Lesson's slot, numbered and sized like a puzzle's. Once done its picture is printed in it with a ✓, never a
 * sticker: only the Imperium gives those. `next` rings the one to play.
 */
export function LessonSlot({
  number,
  puzzle: { width, height, palette },
  picture,
  done,
  next = false,
  fresh = false,
}: {
  number: number
  puzzle: LessonPuzzle
  picture: string
  done: boolean
  next?: boolean
  /** Done since Learn was last shown: the ✓ pops. */
  fresh?: boolean
}) {
  return (
    <span className={styles.slot}>
      {done ? (
        <Slot number={number} width={width} height={height} className={styles.print}>
          <PixelArt title={picture} width={width} height={height} palette={palette} />
        </Slot>
      ) : (
        <Slot number={number} width={width} height={height} next={next} />
      )}
      {done && (
        <span className={styles.check} data-fresh={fresh || undefined} aria-label="Done">
          ✓
        </span>
      )}
    </span>
  )
}
