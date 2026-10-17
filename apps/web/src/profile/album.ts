import type { Campaign, DailyYear, PuzzleSummary } from '@pixel-imperium/protocol'
import { type Paper, seasonOf } from '../album/paper.ts'
import { isOpen, provinceStates } from '../campaign/progress.ts'
import { dailyId } from '../daily/clock.ts'
import { MONTH_NAMES, datesOf, mm } from '../daily/month.ts'

/** An album on a Profile: a Campaign, or a Year of Dailies whose pages are its Months. */
export type ProfileAlbum =
  | { kind: 'campaign'; id: string; name: string; campaign: Campaign }
  | { kind: 'year'; id: string; name: string; year: DailyYear }

export const yearAlbumId = (year: number) => `daily-${year}`

export const yearOfAlbum = (id: string) => (/^daily-\d{4}$/.test(id) ? Number(id.slice('daily-'.length)) : null)

export const yearAlbumName = (year: number) => `Daily ${year}`

export const campaignAlbum = (campaign: Campaign): ProfileAlbum => ({
  kind: 'campaign',
  id: campaign.id,
  name: campaign.name,
  campaign,
})

export const yearAlbum = (year: DailyYear): ProfileAlbum => ({
  kind: 'year',
  id: yearAlbumId(year.year),
  name: yearAlbumName(year.year),
  year,
})

/** The album's puzzles page by page, a Year's Months holding only the Dailies listed so far. */
export const albumProvinces = (album: ProfileAlbum): { puzzles: readonly PuzzleSummary[] }[] =>
  album.kind === 'campaign' ? album.campaign.provinces : album.year.months.map(puzzles => ({ puzzles }))

/** The verified puzzles a Profile shows: a Party solve in a Province the player hasn't reached stays hidden until they do. */
export function reachedSolves(album: ProfileAlbum, verified: readonly string[]): Set<string> {
  if (album.kind === 'year') return new Set(verified)
  const solved = new Set(verified)
  const { provinces } = provinceStates(album.campaign, id => solved.has(id))
  return new Set(
    album.campaign.provinces.flatMap((p, i) =>
      isOpen(provinces[i]!.state) ? p.puzzles.flatMap(z => (solved.has(z.id) ? [z.id] : [])) : [],
    ),
  )
}

export interface AlbumPage {
  id: string
  name: string
  paper: Paper
  solved: number
  total: number
  complete: boolean
}

/**
 * The album's pages and how far along each is. A Year's are its Months that have Dailies, each counting every date
 * from launch to its last day, as the Month's page does.
 */
export function albumPages(album: ProfileAlbum, isSolved: (puzzleId: string) => boolean): AlbumPage[] {
  if (album.kind === 'campaign') {
    const { provinces } = album.campaign
    return provinceStates(album.campaign, isSolved).provinces.map(({ state, solved, total }, i) => ({
      id: provinces[i]!.id,
      name: provinces[i]!.name,
      paper: provinces[i]!.paper,
      solved,
      total,
      complete: state === 'conquered',
    }))
  }
  const { year, launch } = album.year
  return MONTH_NAMES.flatMap((name, i) => {
    const dates = datesOf(year, i + 1).filter(d => d >= launch)
    if (dates.length === 0) return []
    const solved = dates.filter(d => isSolved(dailyId(d))).length
    return [{ id: mm(i + 1), name, paper: seasonOf(i + 1), solved, total: dates.length, complete: solved === dates.length }]
  })
}
