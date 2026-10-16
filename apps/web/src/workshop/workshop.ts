/**
 * What the Workshop shows: the Author's puzzles (drafts and published) and campaigns under Yours, and the
 * player-made work they've opened by link under Played. Drafts merge the server's list with this device's copies,
 * which can be newer or not sent yet.
 */
import type {
  DraftCampaignDoc,
  DraftCampaignSummary,
  Drafts,
  HexPaper,
  Made,
  MadeCampaignSummary,
  MadePuzzleSummary,
  Paper,
  Played,
  PlayedCampaign,
} from '@pixel-imperium/protocol'
import type { StoredDraft } from '../make/draft-store.ts'

export type WorkshopTab = 'yours' | 'played'

/** `/workshop`: Yours unless `tab` says Played; `open` names the open column, the tab's first by default. */
export interface WorkshopSearch {
  tab?: 'played'
  open?: string
}

export const workshopSearch = (search: Record<string, unknown>): WorkshopSearch => ({
  ...(search.tab === 'played' && { tab: 'played' as const }),
  ...(typeof search.open === 'string' && search.open !== '' && { open: search.open }),
})

/** The column that leads each tab: Puzzles under Yours, Played by link under Played. */
export const PUZZLES = 'puzzles'

export interface Workshop {
  drafts: Drafts
  made: Made
  played: Played
}

export interface DraftEntry {
  kind: 'draft'
  id: string
  title: string
  width: number
  height: number
  paper: HexPaper | null
  /** Last edited. */
  at: string
}

export interface PublishedEntry {
  kind: 'published'
  puzzle: MadePuzzleSummary
  at: string
}

export type PuzzleEntry = DraftEntry | PublishedEntry

/**
 * Drafts as this device knows them, newest first: the server's, overlaid with any newer copy here, plus this
 * device's unsent ones. A copy that was sent but the server no longer has went to publish or was deleted.
 */
export function mergeDrafts(server: Drafts['puzzles'], local: ReadonlyMap<string, StoredDraft>): DraftEntry[] {
  const entry = (id: string, s: StoredDraft): DraftEntry => ({
    kind: 'draft',
    id,
    title: s.draft.title,
    width: s.draft.width,
    height: s.draft.height,
    paper: s.paper,
    at: s.updatedAt,
  })
  const onServer = new Set(server.map(d => d.id))
  const merged = server.map((d): DraftEntry => {
    const here = local.get(d.id)
    return here && Date.parse(here.updatedAt) > Date.parse(d.updatedAt)
      ? entry(d.id, here)
      : { kind: 'draft', id: d.id, title: d.title, width: d.width, height: d.height, paper: d.paper, at: d.updatedAt }
  })
  for (const [id, s] of local) if (!onServer.has(id) && s.unsent) merged.push(entry(id, s))
  return merged.sort(newestFirst)
}

const newestFirst = (a: { at: string }, b: { at: string }) => b.at.localeCompare(a.at)

/** Published puzzles still under Yours: retired ones leave it, and taken-down ones are gone. */
export const livePuzzles = (made: Made): MadePuzzleSummary[] => made.puzzles.filter(p => !p.retired && !p.removed)

const publishedEntry = (puzzle: MadePuzzleSummary): PublishedEntry => ({ kind: 'published', puzzle, at: puzzle.createdAt })

/** Every puzzle under Yours, the last edited or published first. */
export const yourPuzzles = (drafts: readonly DraftEntry[], made: Made): PuzzleEntry[] =>
  [...drafts, ...livePuzzles(made).map(publishedEntry)].sort(newestFirst)

/** Yours' puzzles and the retired ones too, for the full list. */
export const allPuzzles = (drafts: readonly DraftEntry[], made: Made): PuzzleEntry[] =>
  [...drafts, ...made.puzzles.filter(p => !p.removed).map(publishedEntry)].sort(newestFirst)

export type PuzzleFilter = 'all' | 'drafts' | 'published' | 'retired'
export type PuzzleSort = 'newest' | 'size'

const isRetiredEntry = (e: PuzzleEntry) => e.kind === 'published' && e.puzzle.retired === true

const FILTERS: Record<PuzzleFilter, (e: PuzzleEntry) => boolean> = {
  all: () => true,
  drafts: e => e.kind === 'draft',
  published: e => e.kind === 'published' && !isRetiredEntry(e),
  retired: isRetiredEntry,
}

const areaOf = (e: PuzzleEntry) => (e.kind === 'draft' ? e.width * e.height : e.puzzle.width * e.puzzle.height)

/** `entries` matching a title search and a filter, newest first or biggest first; `entries` comes newest first. */
export function findPuzzles(
  entries: readonly PuzzleEntry[],
  { query, filter, sort }: { query: string; filter: PuzzleFilter; sort: PuzzleSort },
): PuzzleEntry[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const found = entries.filter(e => {
    if (!FILTERS[filter](e)) return false
    const title = titleOf(e.kind === 'draft' ? e.title : e.puzzle.title).toLowerCase()
    return words.every(w => title.includes(w))
  })
  return sort === 'size' ? found.sort((a, b) => areaOf(b) - areaOf(a)) : found
}

export type CampaignEntry =
  | { kind: 'published'; campaign: MadeCampaignSummary }
  | { kind: 'draft'; campaign: DraftCampaignSummary }

/** Yours' campaigns: published ones newest first, then drafts, the last edited first. */
export const yourCampaigns = (workshop: Pick<Workshop, 'drafts' | 'made'>): CampaignEntry[] => [
  ...workshop.made.campaigns
    .filter(c => !c.retired && !c.removed)
    .map((campaign): CampaignEntry => ({ kind: 'published', campaign })),
  ...workshop.drafts.campaigns.map((campaign): CampaignEntry => ({ kind: 'draft', campaign })),
]

/** Played's campaigns, those taken down left out. */
export const playedCampaigns = (played: Played) => played.campaigns.filter(c => !c.removed)

export const NEW_CAMPAIGN = 'new'

/** One of the Workshop row's columns, by what it holds; `new` is a phone's last, where there are no spines. */
export type RowColumn = { key: string; name: string; paper: Paper } & (
  | { kind: 'puzzles' }
  | { kind: 'published'; campaign: MadeCampaignSummary }
  | { kind: 'draft'; campaign: DraftCampaignSummary }
  | { kind: 'played'; campaign: PlayedCampaign }
  | { kind: 'new' }
)

/** The row a tab of the Workshop draws, Puzzles or Played by link first. */
export function workshopRow(workshop: Workshop, tab: WorkshopTab, { phone }: { phone: boolean }): RowColumn[] {
  if (tab === 'played') {
    return [
      { kind: 'puzzles', key: PUZZLES, name: 'Played by link', paper: 'workshop' },
      ...playedCampaigns(workshop.played).map(
        (campaign): RowColumn => ({ kind: 'played', key: campaign.id, name: campaign.title, paper: campaign.paper, campaign }),
      ),
    ]
  }
  return [
    { kind: 'puzzles', key: PUZZLES, name: 'Puzzles', paper: 'workshop' },
    ...yourCampaigns(workshop).map(
      (e): RowColumn =>
        e.kind === 'published'
          ? { kind: 'published', key: e.campaign.id, name: e.campaign.title, paper: e.campaign.paper, campaign: e.campaign }
          : {
              kind: 'draft',
              key: e.campaign.id,
              name: `${titleOf(e.campaign.title)} · draft`,
              paper: e.campaign.paper ?? 'workshop',
              campaign: e.campaign,
            },
    ),
    ...(phone ? [{ kind: 'new', key: NEW_CAMPAIGN, name: 'New campaign', paper: 'workshop' } as const] : []),
  ]
}

/** The open column's place in `row`, the first when `open` names none. */
export const openIndex = (row: readonly RowColumn[], open: string | undefined) =>
  Math.max(0, row.findIndex(c => c.key === (open ?? PUZZLES)))

/** A title as the Workshop shows it, a draft's possibly still blank. */
export const titleOf = (title: string) => title.trim() || 'Untitled'

/** How many of Yours' puzzles are drafts, published, and in a campaign. */
export function puzzleCounts(entries: readonly PuzzleEntry[]) {
  const drafts = entries.filter(e => e.kind === 'draft').length
  const published = entries.length - drafts
  const inCampaigns = entries.filter(e => e.kind === 'published' && e.puzzle.campaignId !== null).length
  return { total: entries.length, drafts, published, inCampaigns }
}

/** What New campaign starts from: the builder adds the rest. */
export const blankCampaignDoc = (): DraftCampaignDoc => ({ title: '', paper: null, provinces: [], crest: null })
