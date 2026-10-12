import type { Campaign, ProfileCampaign, PuzzleSummary } from '@pixel-imperium/protocol'
import { dailyDateOf } from '../daily/clock.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'

export interface StickerEntry {
  puzzle: PuzzleSummary
  /** The province's index in its campaign. */
  province: number
  /** 1-based slot number on the province's pages; a Daily's day of the month. */
  number: number
  palette: (string | null)[] | null
  unverified: boolean
  foil: boolean
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
        foil: storage.loadFoil(puzzle.id),
      }
      return [{ entry, at: storage.loadUpdatedAt(puzzle.id) ?? '' }]
    }),
  )
  return stickers.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).map(s => s.entry)
}

/**
 * A player's verified stickers in a campaign or a Year (its Months as provinces), in `verifiedPuzzleIds` order
 * (latest first on a Profile), foil as theirs are. Art comes from the viewer's own `storage`, so stickers the viewer
 * hasn't collected have a `null` palette.
 */
export function profileStickers(
  album: { provinces: readonly { puzzles: readonly PuzzleSummary[] }[] },
  { verifiedPuzzleIds, foilPuzzleIds }: Pick<ProfileCampaign, 'verifiedPuzzleIds' | 'foilPuzzleIds'>,
  storage: ProgressStorage,
): StickerEntry[] {
  const foil = new Set(foilPuzzleIds)
  const slots = new Map(
    album.provinces.flatMap((province, index) => province.puzzles.map((puzzle, i) => [puzzle.id, { puzzle, index, i }] as const)),
  )
  return verifiedPuzzleIds.flatMap(id => {
    const slot = slots.get(id)
    if (!slot) return []
    const { puzzle, index, i } = slot
    return [
      {
        puzzle,
        province: index,
        number: Number(dailyDateOf(puzzle.id)?.slice(8) ?? i + 1),
        palette: storage.loadPalette(puzzle.id, puzzle.width * puzzle.height),
        unverified: false,
        foil: foil.has(id),
      },
    ]
  })
}

/** A showcase holds at most this many; the first is the big one. */
export const SHOWCASE_SIZE = 3

/**
 * The showcase on a cover: the player's `picks` found among their verified `stickers`, in pick order, or,
 * with none of them here, the first `fallback` stickers (latest first) in their place.
 */
export function showcaseOf(
  stickers: readonly StickerEntry[],
  picks: readonly string[],
  fallback = SHOWCASE_SIZE,
): { stickers: StickerEntry[]; picked: boolean } {
  const byId = new Map(stickers.map(s => [s.puzzle.id, s]))
  const picked = picks.flatMap(id => byId.get(id) ?? [])
  return picked.length > 0
    ? { stickers: picked, picked: true }
    : { stickers: stickers.slice(0, fallback), picked: false }
}

/** Of the device's latest stickers, those a cover can show: verified, with art. */
export const coverStickers = (latest: readonly StickerEntry[]) => latest.filter(s => !s.unverified && s.palette !== null)
