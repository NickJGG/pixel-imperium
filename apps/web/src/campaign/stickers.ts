import type { Campaign, PuzzleSummary } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'

export interface StickerEntry {
  puzzle: PuzzleSummary
  /** The province's index in its campaign. */
  province: number
  /** 1-based slot number on the province's pages. */
  number: number
  palette: (string | null)[] | null
  unverified: boolean
}

/**
 * Every sticker the player has in the campaign, latest first. A solve keeps no date of its own,
 * so the grid's last change stands in for it; undated ones go last, in campaign order.
 */
export function latestStickers(campaign: Pick<Campaign, 'provinces'>, storage: ProgressStorage): StickerEntry[] {
  const stickers = campaign.provinces.flatMap((province, index) =>
    province.puzzles.flatMap((puzzle, i) => {
      const mark = storage.loadSolved(puzzle.id)
      if (mark === null) return []
      const entry: StickerEntry = {
        puzzle,
        province: index,
        number: i + 1,
        palette: storage.loadPalette(puzzle.id, puzzle.width * puzzle.height),
        unverified: mark === 'unverified',
      }
      return [{ entry, at: storage.loadUpdatedAt(puzzle.id) ?? '' }]
    }),
  )
  return stickers.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).map(s => s.entry)
}

/**
 * A player's verified stickers in the campaign, in `verifiedIds` order (latest first on a Profile). Art comes
 * from the viewer's own `storage`, so stickers the viewer hasn't collected have a `null` palette.
 */
export function profileStickers(
  campaign: Pick<Campaign, 'provinces'>,
  verifiedIds: readonly string[],
  storage: ProgressStorage,
): StickerEntry[] {
  const slots = new Map(
    campaign.provinces.flatMap((province, index) => province.puzzles.map((puzzle, i) => [puzzle.id, { puzzle, index, i }] as const)),
  )
  return verifiedIds.flatMap(id => {
    const slot = slots.get(id)
    if (!slot) return []
    const { puzzle, index, i } = slot
    return [
      {
        puzzle,
        province: index,
        number: i + 1,
        palette: storage.loadPalette(puzzle.id, puzzle.width * puzzle.height),
        unverified: false,
      },
    ]
  })
}

/** What the cover shows until a showcase is chosen: the latest stickers with art, three for an account, two signed out. */
export function showcaseFallback(latest: readonly StickerEntry[], signedIn: boolean): StickerEntry[] {
  return latest.filter(s => !s.unverified && s.palette !== null).slice(0, signedIn ? 3 : 2)
}

/** A Crest: a province's last (gold) puzzle's picture, round on its Landmark. */
export interface CrestArt {
  title: string
  width: number
  height: number
  palette: (string | null)[]
}

/** Each province's Crest as this device has it, `null` until its last puzzle's colours are known. */
export function crestsOf(campaign: Pick<Campaign, 'provinces'>, storage: ProgressStorage): (CrestArt | null)[] {
  return campaign.provinces.map(({ puzzles }) => {
    const last = puzzles.at(-1)
    const palette = last && storage.loadPalette(last.id, last.width * last.height)
    return last && palette ? { title: last.title, width: last.width, height: last.height, palette } : null
  })
}
