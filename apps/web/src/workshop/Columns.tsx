/** The Workshop row's columns, and the parts Home's Workshop column shares with them. */
import { Link, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import {
  type Campaign,
  DRAFT_CAMPAIGN_CAP,
  type MadeCampaignSummary,
  type MadePuzzleSummary,
  type PlayedCampaign,
  type PlayedPuzzle,
} from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { CountPill } from '../album/CountPill.tsx'
import { startDraftCampaign } from '../api.ts'
import { CampaignStack } from '../campaign/CampaignColumn.tsx'
import { World, workshopMorphName } from '../campaign/worlds/Worlds.tsx'
import { addDraftCampaign } from '../content.ts'
import { BlankCrest } from '../home/Crest.tsx'
import { MAX_TITLE } from '../make/draft.ts'
import { newDraftId } from '../make/draft-store.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { shortDate } from '../profile/activity.ts'
import { openCampaign } from './campaign-store.ts'
import { EditableText } from './fields.tsx'
import { DraftFace, PlayedFace, PlayedShelf, YoursShelf } from './Shelf.tsx'
import {
  type DraftEntry,
  NEW_CAMPAIGN,
  PUZZLES,
  type PuzzleEntry,
  blankCampaignDoc,
  puzzleCounts,
  titleOf,
} from './workshop.ts'
import styles from '../home/Home.module.css'
import builder from './Builder.module.css'
import own from './Workshop.module.css'

/** A fresh draft's editor; the id is picked once, so the link holds still across renders. */
export function NewPuzzleLink({ primary = false }: { primary?: boolean }) {
  const [id] = useState(newDraftId)
  return (
    <Link
      to="/workshop/p/$id"
      params={{ id }}
      data-variant={primary ? 'primary' : 'paper'}
      data-pad-default={primary || undefined}
    >
      New puzzle
    </Link>
  )
}

/** The draft last edited, as a column's Next up. */
export function LastEdited({ draft }: { draft: DraftEntry }) {
  return (
    <div className={styles.next}>
      <Link
        to="/workshop/p/$id"
        params={{ id: draft.id }}
        className={styles.nextSlot}
        tabIndex={-1}
        aria-hidden="true"
      >
        <DraftFace draft={draft} />
      </Link>
      <div className={styles.nextText}>
        <p className={styles.kicker}>Last edited</p>
        <p className={styles.nextName}>{titleOf(draft.title)}</p>
        <p className={styles.sub}>
          Draft · {draft.width}×{draft.height}
        </p>
      </div>
    </div>
  )
}

export const lastDraft = (entries: readonly PuzzleEntry[]): DraftEntry | undefined =>
  entries.find((e): e is DraftEntry => e.kind === 'draft')

/** Under Yours, before the campaigns: every puzzle, the last edited draft as Next up. */
export function PuzzlesColumn({ entries, start }: { entries: readonly PuzzleEntry[]; start: boolean }) {
  const counts = puzzleCounts(entries)
  const last = lastDraft(entries)
  return (
    <World paper="workshop" labelledBy="workshop-puzzles" style={workshopMorphName(PUZZLES)} start={start} pair>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>Your puzzles</p>
          <h2 id="workshop-puzzles" className={styles.hero}>
            Puzzles
          </h2>
          {counts.total > 0 ? (
            <>
              <CountPill className={styles.count}>{counts.total}</CountPill>
              <p className={styles.sub}>
                {counts.drafts} {counts.drafts === 1 ? 'draft' : 'drafts'} · {counts.published} published ·{' '}
                {counts.inCampaigns} in campaigns
              </p>
            </>
          ) : (
            <p className={styles.line}>Draw a pixel-art puzzle, then share it by link.</p>
          )}
          {last && <LastEdited draft={last} />}
          <div className={styles.actions}>
            {last && (
              <Link to="/workshop/p/$id" params={{ id: last.id }} data-variant="primary" data-pad-default>
                Keep drawing
              </Link>
            )}
            <NewPuzzleLink primary={!last} />
            {counts.total > 0 && (
              <Link to="/workshop/puzzles" data-variant="paper">
                All puzzles
              </Link>
            )}
          </div>
        </div>
        {counts.total > 0 && (
          <div className={styles.picture}>
            <div className={own.shelfWrap}>
              <YoursShelf entries={entries} limit={15} />
            </div>
          </div>
        )}
      </div>
    </World>
  )
}

/** Under Played, before the campaigns: standalone puzzles opened by link, someone else's. */
export function PlayedByLinkColumn({
  puzzles,
  storage,
  start,
}: {
  puzzles: readonly PlayedPuzzle[]
  storage: ProgressStorage
  start: boolean
}) {
  const live = puzzles.filter(p => !p.removed)
  const solved = live.filter(p => storage.loadSolved(p.id) !== null).length
  const next = live.find(p => storage.loadSolved(p.id) === null)
  return (
    <World paper="workshop" labelledBy="workshop-played" style={workshopMorphName(PUZZLES)} start={start} pair>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>Player-made puzzles</p>
          <h2 id="workshop-played" className={styles.hero}>
            Played by link
          </h2>
          {live.length > 0 ? (
            <>
              <CountPill conquered={solved === live.length} className={styles.count}>
                {solved} / {live.length}
              </CountPill>
              <p className={styles.sub}>Puzzles you’ve opened by link, the latest first.</p>
            </>
          ) : (
            <p className={styles.line}>When someone shares a puzzle with you, it lands here once you’ve started it.</p>
          )}
          {next && (
            <>
              <div className={styles.next}>
                <Link
                  to="/play/$id"
                  params={{ id: next.id }}
                  className={styles.nextSlot}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <PlayedFace puzzle={next} storage={storage} />
                </Link>
                <div className={styles.nextText}>
                  <p className={styles.kicker}>Next up</p>
                  <p className={styles.nextName}>{next.title}</p>
                  <p className={styles.sub}>
                    {next.width}×{next.height} · by @{next.author}
                  </p>
                </div>
              </div>
              <div className={styles.actions}>
                <Link to="/play/$id" params={{ id: next.id }} data-variant="primary" data-pad-default>
                  Continue
                </Link>
              </div>
            </>
          )}
        </div>
        {puzzles.length > 0 && (
          <div className={styles.picture}>
            <div className={own.shelfWrap}>
              <PlayedShelf puzzles={puzzles} storage={storage} />
            </div>
          </div>
        )}
      </div>
    </World>
  )
}

/** One of the Author's published campaigns: its link, and the puzzles in it. */
export function OwnCampaignColumn({
  campaign,
  puzzles,
  start,
}: {
  campaign: MadeCampaignSummary
  /** The Author's published puzzles, those in this campaign among them. */
  puzzles: readonly MadePuzzleSummary[]
  start: boolean
}) {
  const titleId = `workshop-${campaign.id}`
  const [notice, setNotice] = useState<string | null>(null)
  const url = `${location.origin}/c/${campaign.id}`
  const copyLink = () =>
    navigator.clipboard.writeText(url).then(
      () => setNotice('Copied the link.'),
      () => setNotice('Couldn’t reach the clipboard.'),
    )
  const inIt = puzzles.filter(p => p.campaignId === campaign.id)
  return (
    <World paper={campaign.paper} labelledBy={titleId} style={workshopMorphName(campaign.id)} start={start} pair>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>Your campaign · published {shortDate(new Date(campaign.createdAt), new Date())}</p>
          <h2 id={titleId} className={styles.hero}>
            {campaign.title}
          </h2>
          <CountPill className={styles.count}>{campaign.total} puzzles</CountPill>
          <div className={styles.actions}>
            <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} data-variant="primary" data-pad-default>
              Open {campaign.title}
            </Link>
            <button type="button" data-variant="paper" onClick={() => void copyLink()}>
              Copy link
            </button>
          </div>
          {notice && (
            <p className={styles.sub} role="status">
              {notice}
            </p>
          )}
        </div>
        {inIt.length > 0 && (
          <div className={styles.picture}>
            <div className={own.shelfWrap}>
              <YoursShelf entries={inIt.map(puzzle => ({ kind: 'published', puzzle, at: puzzle.createdAt }))} />
            </div>
          </div>
        )}
      </div>
    </World>
  )
}

/**
 * A campaign played by link: its campaign column once loaded, as on Campaigns, with its Author's byline; until then,
 * or taken down, its summary.
 */
export function PlayedCampaignColumn({
  summary,
  campaign,
  storage,
  start,
}: {
  summary: PlayedCampaign
  campaign: Campaign | null
  storage: ProgressStorage
  start: boolean
}) {
  const titleId = `workshop-${summary.id}`
  return (
    <World paper={summary.paper} labelledBy={titleId} style={workshopMorphName(summary.id)} start={start} pair>
      {campaign ? (
        <CampaignStack campaign={campaign} storage={storage} titleId={titleId} />
      ) : (
        <div className={styles.column}>
          <div className={styles.stack}>
            <p className={styles.kicker}>
              Campaign · by @{summary.author}
              {summary.retired && ' · retired'}
            </p>
            <h2 id={titleId} className={styles.hero}>
              {summary.title}
            </h2>
            <CountPill conquered={summary.solved === summary.total} className={styles.count}>
              {summary.solved} / {summary.total}
            </CountPill>
            <div className={styles.actions}>
              <Link to="/c/$campaignId" params={{ campaignId: summary.id }} data-variant="primary" data-pad-default>
                Open {summary.title}
              </Link>
            </div>
          </div>
        </div>
      )}
    </World>
  )
}

/**
 * Yours' last column, a blank draft cover: a campaign starts only once it's named, then this column becomes its cover.
 * A typed name lasts until the column is left; at the cap of draft campaigns, none can be typed.
 */
export function NewCampaignColumn({ full, start }: { full: boolean; start: boolean }) {
  const { account } = useAccount()
  const navigate = useNavigate()
  const [id] = useState(newDraftId)
  const [title, setTitle] = useState('')
  const [state, setState] = useState<{ sending: boolean; refused: 'full' | 'offline' | null }>({ sending: false, refused: null })
  const [wasStart, setWasStart] = useState(start)
  if (start !== wasStart) {
    setWasStart(start)
    if (!start) setTitle('')
  }
  const capped = full || state.refused === 'full'

  const begin = async (name: string) => {
    if (!name || capped || state.sending) return
    setState({ sending: true, refused: null })
    const updatedAt = new Date().toISOString()
    const doc = { ...blankCampaignDoc(), title: name }
    const res = await startDraftCampaign(id, { doc, updatedAt }).catch(() => 'offline' as const)
    if (!res || res === 'offline') {
      setState({ sending: false, refused: res ?? 'full' })
      return
    }
    const userId = account!.userId
    openCampaign({ userId, id }, { doc, updatedAt, unsent: false, preview: res.preview })
    addDraftCampaign(userId, { id, title: name, paper: null, createdAt: updatedAt, updatedAt })
    void navigate({ to: '/workshop', search: { open: id }, replace: true })
  }

  return (
    <World paper="workshop" labelledBy="workshop-new" style={workshopMorphName(NEW_CAMPAIGN)} start={start} pair>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>New campaign</p>
          <div className={`${styles.hero} ${builder.nameRow}`}>
            <h2 id="workshop-new">
              {capped ? (
                <span className={builder.placeholder}>Campaign name</span>
              ) : (
                <EditableText
                  value={title}
                  placeholder="Campaign name"
                  label="Campaign title"
                  maxLength={MAX_TITLE}
                  onSave={setTitle}
                  onEnter={name => void begin(name)}
                />
              )}
            </h2>
          </div>
          <div className={styles.actions}>
            <button
              type="button"
              data-variant="primary"
              data-pad-default
              disabled={!title.trim() || capped || state.sending}
              onClick={() => void begin(title.trim())}
            >
              Start campaign
            </button>
          </div>
          {capped && (
            <p className={styles.line}>
              You have {DRAFT_CAMPAIGN_CAP} draft campaigns, the most at once. Publish or delete one to start another.
            </p>
          )}
          {state.refused === 'offline' && (
            <p className={styles.sub} role="alert">
              Couldn’t reach the server. Try again in a moment.
            </p>
          )}
        </div>
        <div className={styles.picture}>
          <div className={builder.crestWrap}>
            <BlankCrest />
          </div>
        </div>
      </div>
    </World>
  )
}
