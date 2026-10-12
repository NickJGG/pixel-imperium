import { Link } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import type { Campaign } from '@pixel-imperium/protocol'
import { CountPill } from '../album/CountPill.tsx'
import { paperStyle } from '../album/paper.ts'
import { SlotFace } from '../campaign/PuzzleSlot.tsx'
import type { CampaignProgress, ContinueAt } from '../campaign/progress.ts'
import { World } from '../campaign/worlds/Worlds.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { Crest } from './Crest.tsx'
import { crestPixels } from './crest.ts'
import styles from './Home.module.css'

/**
 * Home's way into the campaign: how far along it is, the puzzle due next, Continue and Open, and the Crest beside
 * them. Once every province is conquered there's no Next up and no Continue, and Open goes to the last province.
 */
export function CampaignColumn({
  campaign,
  progress,
  next,
  active,
  storage,
  start,
  style,
}: {
  campaign: Campaign
  progress: CampaignProgress
  next: ContinueAt | null
  /** The province being worked through, or the last once all are conquered, by index: its paper is the column's. */
  active: number
  storage: ProgressStorage
  start: boolean
  style: CSSProperties
}) {
  const province = campaign.provinces[active]!
  const here = progress.provinces[active]!
  const solved = progress.provinces.reduce((n, p) => n + p.solved, 0)
  const total = progress.provinces.reduce((n, p) => n + p.total, 0)
  const conquered = progress.provinces.filter(p => p.state === 'conquered').length
  const pixels = crestPixels(campaign, storage)

  return (
    <World index={active} labelledBy="home-campaign" style={style} start={start} pair>
      <div className={styles.column}>
        <div className={styles.stack}>
          <p className={styles.kicker}>
            Campaign · {conquered} of {campaign.provinces.length} conquered
          </p>
          <h2 id="home-campaign" className={styles.hero}>
            {campaign.name}
          </h2>
          <CountPill conquered={progress.conquered} className={styles.count}>
            {solved} / {total}
          </CountPill>
          <div className={styles.bar} aria-hidden="true">
            {campaign.provinces.map((p, i) => {
              const { solved, total } = progress.provinces[i]!
              const share = total === 0 ? 0 : (solved / total) * 100
              return <i key={p.id} style={{ ...paperStyle(i), '--f': `${share}%` } as CSSProperties} />
            })}
          </div>
          <p className={styles.sub}>
            {province.name} · {here.solved}/{here.total}
          </p>
          {next && (
            <div className={styles.next}>
              <Link
                to="/play/$id"
                params={{ id: next.puzzle.id }}
                className={styles.nextSlot}
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
            <Link
              to="/c/$campaignId/$provinceId"
              params={{ campaignId: campaign.id, provinceId: province.id }}
              data-variant="paper"
              data-pad-default={!next || undefined}
            >
              Open {province.name.replace(/^The /, 'the ')}
            </Link>
          </div>
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
    </World>
  )
}
