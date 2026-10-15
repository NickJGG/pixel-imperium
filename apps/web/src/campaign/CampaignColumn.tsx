import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import type { Campaign } from '@pixel-imperium/protocol'
import { CountPill } from '../album/CountPill.tsx'
import { NewBadge } from '../album/NewBadge.tsx'
import { paperFor } from '../album/paper.ts'
import { useAccount } from '../account.ts'
import { startOf } from '../daily/clock.ts'
import { Crest } from '../home/Crest.tsx'
import { crestPixels } from '../home/crest.ts'
import { usePrefetch } from '../play/prefetch.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { shortDate } from '../profile/activity.ts'
import { Bar, Ghost } from '../skeleton/Skeleton.tsx'
import { featuredUntil } from './campaigns.ts'
import { campaignProgress, continueAt } from './progress.ts'
import { SlotFace } from './PuzzleSlot.tsx'
import { ReportButton } from '../workshop/Report.tsx'
import { doorSlot } from './worlds/names.ts'
import styles from '../home/Home.module.css'

/**
 * A campaign's column, inside its `World`: how far along it is, the puzzle due next, Continue and Open, and the
 * Crest beside them. Once every province is conquered there's no Next up and no Continue, and Open, when it opens a
 * province, goes to the last. Unstarted, it all reads zero: Start, the first province, a blank Crest.
 */
export function CampaignStack({
  campaign,
  storage,
  titleId,
  opens = 'province',
  featured,
}: {
  campaign: Campaign
  storage: ProgressStorage
  /** Its heading's id, for the `World`'s label. */
  titleId: string
  /**
   * What Open leads to: the active province, or on Home, the campaign's own column on Campaigns, as "All campaigns"
   * unless it's the Featured one, still new to the player.
   */
  opens?: 'province' | 'campaign'
  /** Wears a New badge in its kicker; on Home, whose column for it lasts only so long, with the window's end. */
  featured?: 'row' | 'home' | undefined
}) {
  const progress = campaignProgress(campaign, storage)
  const next = continueAt(campaign, progress, id => storage.loadSolved(id) !== null)
  usePrefetch(next?.puzzle.id)
  const active = next ? campaign.provinces.indexOf(next.province) : campaign.provinces.length - 1
  const province = campaign.provinces[active]
  const here = progress.provinces[active]
  const solved = progress.provinces.reduce((n, p) => n + p.solved, 0)
  const total = progress.provinces.reduce((n, p) => n + p.total, 0)
  const conquered = progress.provinces.filter(p => p.state === 'conquered').length
  const pixels = crestPixels(campaign, storage)
  const { account } = useAccount()
  const { author } = campaign
  const own = author !== undefined && account?.handle.toLowerCase() === author.toLowerCase()

  return (
    <div className={styles.column}>
      <div className={styles.stack}>
        <p className={styles.kicker}>
          {featured === 'home' && campaign.released !== undefined ? (
            <>
              <NewBadge /> · until {shortDate(startOf(featuredUntil(campaign.released)), new Date())}
            </>
          ) : (
            <>
              Campaign · {featured && <><NewBadge /> · </>}
              {author !== undefined && (
                <>
                  by{' '}
                  <Link to="/u/$handle" params={{ handle: author }}>
                    @{author}
                  </Link>{' '}
                  ·{' '}
                </>
              )}
              {conquered} of {campaign.provinces.length} conquered
            </>
          )}
        </p>
        <h2 id={titleId} className={styles.hero}>
          {campaign.name}
        </h2>
        <CountPill conquered={progress.conquered} className={styles.count}>
          {solved} / {total}
        </CountPill>
        <div className={styles.bar} aria-hidden="true">
          {campaign.provinces.map((p, i) => {
            const { solved, total } = progress.provinces[i]!
            const share = total === 0 ? 0 : (solved / total) * 100
            return <i key={p.id} style={{ ...paperFor(p.paper), '--f': `${share}%` } as CSSProperties} />
          })}
        </div>
        {province && here && (
          <p className={styles.sub}>
            {province.name} · {here.solved}/{here.total}
          </p>
        )}
        {next && (
          <div className={styles.next}>
            <Link
              to="/play/$id"
              params={{ id: next.puzzle.id }}
              className={styles.nextSlot}
              {...doorSlot(next.puzzle.id)}
              tabIndex={-1}
              aria-hidden="true"
            >
              <SlotFace puzzle={next.puzzle} number={next.number} storage={storage} next />
            </Link>
            <div className={styles.nextText}>
              <p className={styles.kicker}>Next up</p>
              <p className={styles.nextName}>
                #{next.number} {next.puzzle.title}
              </p>
              <p className={styles.sub}>
                {next.puzzle.width}×{next.puzzle.height} · {next.province.name}
              </p>
            </div>
          </div>
        )}
        <div className={styles.actions}>
          {next && (
            <Link to="/play/$id" params={{ id: next.puzzle.id }} data-variant="primary" data-pad-default>
              {next.fresh ? 'Start' : 'Continue'}
            </Link>
          )}
          {opens === 'campaign' ? (
            <Link
              to="/c/$campaignId"
              params={{ campaignId: campaign.id }}
              data-variant="paper"
              data-pad-default={!next || undefined}
            >
              {featured === 'home' ? `Open ${campaign.name.replace(/^The /, 'the ')}` : 'All campaigns'}
            </Link>
          ) : (
            province && (
              <Link
                to="/c/$campaignId/$provinceId"
                params={{ campaignId: campaign.id, provinceId: province.id }}
                data-variant="paper"
                data-pad-default={!next || undefined}
              >
                Open {province.name.replace(/^The /, 'the ')}
              </Link>
            )
          )}
        </div>
        {author !== undefined && !own && <ReportButton targetId={campaign.id} what="campaign" />}
      </div>
      {pixels && campaign.crest && (
        <div className={styles.picture}>
          <Crest
            campaignId={campaign.id}
            width={campaign.crest.width}
            height={campaign.crest.height}
            pixels={pixels}
            marker={next?.puzzle.crest ?? null}
          />
        </div>
      )}
    </div>
  )
}

/** A campaign's column while it loads, shaped by `campaign` when it's in memory. */
export function CampaignStackSkeleton({ campaign }: { campaign: Campaign | null }) {
  const crest = campaign?.crest
  return (
    <div className={styles.column}>
      <div className={styles.stack}>
        <Bar w="68%" h={14} />
        <Bar w="80%" h={52} />
        <Bar w={104} h={30} pill />
        <div className={styles.bar}>
          {Array.from({ length: campaign?.provinces.length ?? 6 }, (_, i) => (
            <Bar key={i} h={8} style={{ flex: 1 }} />
          ))}
        </div>
        <Bar w="46%" h={16} />
        <div className={styles.next}>
          <Ghost style={{ width: 64, height: 64 }} />
          <div className={styles.nextText}>
            <p className={styles.kicker}>Next up</p>
            <Bar w={160} h={20} style={{ margin: 'var(--space-1) 0' }} />
            <Bar w={90} h={16} />
          </div>
        </div>
        <div className={styles.actions}>
          <Bar w="100%" h={52} pill />
          <Bar w="100%" h={52} pill />
        </div>
      </div>
      <div className={styles.picture}>
        <Ghost style={{ width: 'min(100%, 520px)', aspectRatio: crest ? `${crest.width} / ${crest.height}` : 1 }} />
      </div>
    </div>
  )
}
