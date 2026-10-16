import { Link } from '@tanstack/react-router'
import { type CSSProperties, useMemo, useState } from 'react'
import { CountPill } from '../album/CountPill.tsx'
import { World } from '../campaign/worlds/Worlds.tsx'
import { localDrafts } from '../make/draft-store.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { LastEdited, NewPuzzleLink, lastDraft } from '../workshop/Columns.tsx'
import { PlayedShelf, YoursShelf } from '../workshop/Shelf.tsx'
import { type Workshop, type WorkshopTab, mergeDrafts, playedCampaigns, yourPuzzles } from '../workshop/workshop.ts'
import own from '../workshop/Workshop.module.css'
import styles from './Home.module.css'

const SHELF = 10

/**
 * Home's way into the Workshop, signed in only, mirroring the Campaign column: the draft last edited as Next up, a way
 * back into it or to a new one, and a shelf of your puzzles, or of what you've played by link. A first-timer gets a
 * line on what it's for. Shown empty when the Workshop couldn't load.
 */
export function WorkshopColumn({
  userId,
  workshop,
  storage,
  start,
  style,
}: {
  userId: string
  workshop: Workshop | null
  storage: ProgressStorage
  start: boolean
  style: CSSProperties
}) {
  const [local] = useState(() => localDrafts(userId))
  const entries = useMemo(
    () => yourPuzzles(mergeDrafts(workshop?.drafts.puzzles ?? [], local), workshop?.made ?? { puzzles: [], campaigns: [] }),
    [workshop, local],
  )
  const [shelf, setShelf] = useState<WorkshopTab>('yours')
  const drafts = entries.filter(e => e.kind === 'draft').length
  const published = entries.length - drafts
  const draftCampaigns = workshop?.drafts.campaigns.length ?? 0
  const some = entries.length > 0 || draftCampaigns > 0 || (workshop?.made.campaigns.length ?? 0) > 0
  const last = lastDraft(entries)
  const played = workshop?.played ?? { puzzles: [], campaigns: [] }
  const playedCount = played.puzzles.length + playedCampaigns(played).length

  return (
    <World paper="workshop" labelledBy="home-workshop" style={style} start={start} pair>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>Your puzzles</p>
          <h2 id="home-workshop" className={styles.hero}>
            Workshop
          </h2>
          {some ? (
            <>
              <CountPill className={styles.count}>{published} published</CountPill>
              <p className={styles.sub}>
                {drafts} draft {drafts === 1 ? 'puzzle' : 'puzzles'} · {draftCampaigns} draft{' '}
                {draftCampaigns === 1 ? 'campaign' : 'campaigns'}
              </p>
            </>
          ) : (
            <p className={styles.line}>Draw your own pixel-art puzzles and share them by link.</p>
          )}
          {last && <LastEdited draft={last} />}
          <div className={styles.actions}>
            {last && (
              <Link to="/workshop/p/$id" params={{ id: last.id }} data-variant="primary" data-pad-default>
                Keep drawing
              </Link>
            )}
            <NewPuzzleLink primary={!last} />
            <Link to="/workshop" data-variant="paper">
              Open the Workshop
            </Link>
          </div>
        </div>
        <div className={styles.picture}>
          <div className={own.shelfWrap}>
            <div className={own.shelfHead}>
              <span className={own.seg} role="group" aria-label="Shelf">
                {(['yours', 'played'] as const).map(t => (
                  <button
                    key={t}
                    type="button"
                    data-variant="flat"
                    data-size="compact"
                    aria-pressed={shelf === t}
                    onClick={() => setShelf(t)}
                  >
                    {t === 'yours' ? 'Yours' : `Played${playedCount > 0 ? ` · ${playedCount}` : ''}`}
                  </button>
                ))}
              </span>
              <Link to="/workshop" search={shelf === 'played' ? { tab: 'played' } : {}} data-variant="flat" data-size="compact">
                All ›
              </Link>
            </div>
            {shelf === 'yours' ? (
              entries.length > 0 ? (
                <YoursShelf entries={entries} limit={SHELF} />
              ) : (
                <p className={own.empty}>Your puzzles sit here, drafts dashed until they’re published.</p>
              )
            ) : playedCount > 0 ? (
              <PlayedShelf puzzles={played.puzzles} campaigns={playedCampaigns(played)} storage={storage} limit={SHELF} />
            ) : (
              <p className={own.empty}>Puzzles and campaigns someone shares with you land here once you’ve played them.</p>
            )}
          </div>
        </div>
      </div>
    </World>
  )
}
