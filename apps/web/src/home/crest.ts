import type { Campaign } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'

/**
 * The Crest's pixels in reading order: each one's colour once its puzzle is solved and its colour has come back
 * with the palette, else `null`. `null` for a campaign without a Crest.
 */
export function crestPixels(
  campaign: Pick<Campaign, 'crest' | 'provinces'>,
  storage: Pick<ProgressStorage, 'loadSolved' | 'loadCrest'>,
): (string | null)[] | null {
  if (!campaign.crest) return null
  const pixels = Array<string | null>(campaign.crest.width * campaign.crest.height).fill(null)
  for (const province of campaign.provinces) {
    for (const puzzle of province.puzzles) {
      if (puzzle.crest === undefined || storage.loadSolved(puzzle.id) === null) continue
      pixels[puzzle.crest] = storage.loadCrest(puzzle.id)
    }
  }
  return pixels
}

/**
 * The pixel the floating sticker should drop onto: the one it hovered over when Home was last shown, if that
 * pixel has since been revealed and the sticker has moved on.
 */
export const landing = (previous: number | null, marker: number | null, pixels: readonly (string | null)[]) =>
  previous !== null && previous !== marker && pixels[previous] != null ? previous : null
