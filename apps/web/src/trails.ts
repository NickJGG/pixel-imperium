/**
 * The menu's Trail for each page, for the page and its skeleton alike: Home first, the current page last. A
 * skeleton passes what it has in memory, or falls back to `[HOME]`.
 */
import type { DraftCampaignDoc } from '@pixel-imperium/protocol'
import { type Paper, seasonOf } from './album/paper.ts'
import { MONTH_NAMES, mm } from './daily/month.ts'
import { campaignSpineName } from './home/columns.ts'
import type { TrailStep } from './Trail.tsx'
import type { Track } from './tutorial/tracks.ts'
import { titleOf } from './workshop/workshop.ts'

interface Place {
  id: string
  name: string
  paper: Paper
}

export const HOME: TrailStep = { to: '/', label: 'Home' }

const WORKSHOP: TrailStep = { to: '/workshop', label: 'Workshop', paper: 'workshop' }

const campaignStep = (campaign: Place): TrailStep => ({
  to: `/c/${campaign.id}`,
  label: campaignSpineName(campaign),
  paper: campaign.paper,
})

const provinceStep = (campaign: Place, province: Place): TrailStep => ({
  to: `/c/${campaign.id}/${province.id}`,
  label: campaignSpineName(province),
  paper: province.paper,
})

export const campaignTrail = (campaign: Place): TrailStep[] => [HOME, campaignStep(campaign)]

export const provinceTrail = (campaign: Place, province: Place): TrailStep[] => [
  HOME,
  campaignStep(campaign),
  provinceStep(campaign, province),
]

/** A puzzle in its album: an official one, or a made one in its campaign. */
export const puzzleTrail = (campaign: Place, province: Place, puzzle: { id: string; title: string }): TrailStep[] => [
  ...provinceTrail(campaign, province),
  { to: `/play/${puzzle.id}`, label: puzzle.title, paper: province.paper },
]

/** Where a standalone made puzzle belongs: its Author's Workshop, the Workshop's Played by link, or Home signed out. */
export type MadePlace = 'workshop' | 'played' | 'home'

export const madeTrail = (place: MadePlace, puzzle: { id: string; title: string; paper: Paper }): TrailStep[] => [
  HOME,
  ...(place === 'workshop'
    ? [WORKSHOP]
    : place === 'played'
      ? [{ ...WORKSHOP, label: 'Played by link', search: { tab: 'played' } }]
      : []),
  { to: `/play/${puzzle.id}`, label: puzzle.title, paper: puzzle.paper },
]

/** A co-op's Trail is its puzzle's, the last step being the co-op; `album` is the puzzle's place, if it has one. */
export const coopTrail = (
  code: string,
  puzzle: { title: string; paper: Paper } | null,
  album: { campaign: Place; province: Place } | null,
): TrailStep[] => {
  const coop = { to: `/co/${code}`, label: puzzle ? `Co-op · ${puzzle.title}` : 'Co-op' }
  if (!puzzle) return [HOME, coop]
  if (!album) return [HOME, { ...coop, paper: puzzle.paper }]
  return [...provinceTrail(album.campaign, album.province), { ...coop, paper: album.province.paper }]
}

export const monthTrail = (year: number, month: number): TrailStep[] => [
  HOME,
  { to: `/daily/${year}/${mm(month)}`, label: `Daily · ${MONTH_NAMES[month - 1]}`, paper: seasonOf(month) },
]

export const dailyTrail = (year: number, month: number, day: number): TrailStep[] => [
  ...monthTrail(year, month),
  { to: `/daily/${year}/${mm(month)}/${mm(day)}`, label: String(day), paper: seasonOf(month) },
]

export const trackTrail = (track: Pick<Track, 'id' | 'name' | 'paper'>): TrailStep[] => [
  HOME,
  { to: '/learn', label: 'Learn', paper: track.paper },
  { to: `/learn/${track.id}`, label: track.name, paper: track.paper },
]

export const lessonTrail = (track: Pick<Track, 'id' | 'name' | 'paper'>, lesson: { id: string; title: string }): TrailStep[] => [
  ...trackTrail(track),
  { to: `/learn/${track.id}/${lesson.id}`, label: lesson.title, paper: track.paper },
]

export const SETTINGS_TRAIL: TrailStep[] = [HOME, { to: '/settings', label: 'Settings', paper: 'capital' }]

export const profileTrail = (handle: string): TrailStep[] => [
  HOME,
  { to: `/u/${handle}`, label: `@${handle}`, paper: 'marches' },
]

export const WORKSHOP_TRAIL: TrailStep[] = [HOME, WORKSHOP]

export const ALL_PUZZLES_TRAIL: TrailStep[] = [HOME, WORKSHOP, { to: '/workshop/puzzles', label: 'Puzzles', paper: 'workshop' }]

export const MAKE_TRAIL: TrailStep[] = [HOME, WORKSHOP, { to: '/make', label: 'Make', paper: 'workshop' }]

/** One of the Author's puzzles in the editor, or published. */
export const workshopPuzzleTrail = (puzzle: { id: string; title: string; paper: Paper }): TrailStep[] => [
  HOME,
  WORKSHOP,
  { to: `/workshop/p/${puzzle.id}`, label: puzzle.title, paper: puzzle.paper },
]

/** A draft campaign, as the Workshop open on its column. */
const draftStep = (id: string, doc: DraftCampaignDoc): TrailStep => ({
  ...WORKSHOP,
  label: titleOf(doc.title),
  paper: doc.paper ?? 'workshop',
  search: { open: id },
})

export const crestTrail = (id: string, doc: DraftCampaignDoc): TrailStep[] => [
  HOME,
  draftStep(id, doc),
  { to: `/workshop/c/${id}/crest`, label: 'Crest', paper: doc.paper ?? 'workshop' },
]

/** `n` is the province's 1-based place; `province` is as `draftAsCampaign` has it, its name and paper filled in. */
export const draftProvinceTrail = (
  id: string,
  doc: DraftCampaignDoc,
  n: number,
  province: { name: string; paper: Paper },
): TrailStep[] => [
  HOME,
  draftStep(id, doc),
  { to: `/workshop/c/${id}/${n}`, label: province.name, paper: province.paper },
]

export const playtestTrail = (
  id: string,
  doc: DraftCampaignDoc,
  n: number,
  province: { name: string; paper: Paper },
): TrailStep[] => [
  HOME,
  draftStep(id, doc),
  { to: `/workshop/c/${id}/playtest/${n}`, label: `Playtest · ${province.name}`, paper: province.paper },
]

export const playtestPuzzleTrail = (
  id: string,
  doc: DraftCampaignDoc,
  n: number,
  province: { name: string; paper: Paper },
  slot: number,
  title: string,
): TrailStep[] => [
  ...playtestTrail(id, doc, n, province),
  { to: `/workshop/c/${id}/playtest/${n}/${slot}`, label: title, paper: province.paper },
]
