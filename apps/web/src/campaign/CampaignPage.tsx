import { type CSSProperties, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { Campaign, CampaignSummary } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { Lock } from '../album/Lock.tsx'
import { paperStyle } from '../album/paper.ts'
import { Slot } from '../album/Slot.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { VolumeShelf } from '../album/VolumeShelf.tsx'
import { useAccount } from '../account.ts'
import { campaignProgress, continueAt, isOpen } from './progress.ts'
import { GOLD_SLOT } from './PuzzleSlot.tsx'
import { SHOWCASE_SIZE, type StickerEntry, coverStickers, latestStickers, showcaseOf } from './stickers.ts'
import styles from './Cover.module.css'

interface Props {
  campaign: Campaign
  /** Every live campaign; the shelf of volumes shows only when there's more than one. */
  campaigns: CampaignSummary[]
}

const LATEST = 8
/** Where the showcase's stickers land on the cover, biggest first. */
const SLAPS = [
  { tilt: 10, width: 96 },
  { tilt: -8, width: 72 },
  { tilt: 5, width: 64 },
]

export function CampaignPage(props: Props) {
  const { generation } = useAccount()
  return <Cover key={`${generation}:${props.campaign.id}`} {...props} />
}

/** Home: the album's cover, with what's next and the latest stickers. */
function Cover({ campaign, campaigns }: Props) {
  const { storage, account } = useAccount()
  const [{ progress, latest }] = useState(() => ({
    progress: campaignProgress(campaign, storage),
    latest: latestStickers(campaign, storage),
  }))
  const isSolved = (id: string) => storage.loadSolved(id) !== null
  const next = continueAt(campaign, progress, isSolved)
  const solved = progress.provinces.reduce((n, p) => n + p.solved, 0)
  const total = progress.provinces.reduce((n, p) => n + p.total, 0)
  const foil = latest.filter(s => s.foil && !s.unverified).length
  const showcase = showcaseOf(coverStickers(latest), storage.loadShowcase(), account ? SHOWCASE_SIZE : 2).stickers

  return (
    <main className={styles.page}>
      <div className={styles.home}>
        <div className={styles.coverCol}>
          <section className={styles.cover} aria-labelledby="cover-title">
            <div className={styles.coverTop}>
              <div className={styles.coverTitle}>
                <h1 id="cover-title" className={styles.title}>
                  <span>Pixel</span> Imperium
                </h1>
                <p className={styles.volume}>Sticker album · {campaign.name}</p>
              </div>
              <div className={styles.slaps}>
                {showcase.length > 0
                  ? showcase.map((s, i) => (
                      <StickerLink key={s.puzzle.id} sticker={s} style={{ width: SLAPS[i]!.width }} tilt={SLAPS[i]!.tilt} />
                    ))
                  : next?.fresh && (
                      <Link to="/play/$id" params={{ id: next.puzzle.id }} className={styles.startHere}>
                        Start here
                      </Link>
                    )}
              </div>
            </div>
            <p className={styles.total}>
              <strong>
                {solved} <em>/ {total}</em>
              </strong>
              stickers collected{foil > 0 && ` · ${foil} foil`}
            </p>
            <div className={styles.bar} aria-hidden="true">
              {progress.provinces.map((p, i) => (
                <i
                  key={campaign.provinces[i]!.id}
                  style={{ '--p': `${(p.solved / Math.max(1, p.total)) * 100}%` } as CSSProperties}
                />
              ))}
            </div>
            <ol className={styles.index} aria-label="Provinces">
              {campaign.provinces.map((province, i) => {
                const { state, solved, total } = progress.provinces[i]!
                return (
                  <li key={province.id} style={paperStyle(i)} data-locked={!isOpen(state) || undefined}>
                    <Link to="/c/$campaignId/$provinceId" params={{ campaignId: campaign.id, provinceId: province.id }}>
                      {province.name}
                    </Link>
                    {state === 'conquered' ? (
                      <Dymo tone="pink" className={styles.complete}>
                        Complete
                      </Dymo>
                    ) : isOpen(state) ? (
                      <small>
                        {solved}/{total}
                      </small>
                    ) : (
                      <small>
                        <Lock />
                        Locked
                      </small>
                    )}
                  </li>
                )
              })}
            </ol>
            {next && (
              <div className={styles.cta}>
                <Link to="/play/$id" params={{ id: next.puzzle.id }} className={`${styles.pill} ${styles.cyan}`}>
                  {next.fresh ? 'Start' : 'Continue'}: #{next.number} {next.puzzle.title}
                </Link>
              </div>
            )}
          </section>
          {campaigns.length > 1 && <VolumeShelf campaigns={campaigns} current={campaign.id} />}
        </div>

        <div className={styles.side}>
          <section className={styles.card} aria-labelledby="next-title">
            <h2 id="next-title" className={styles.label}>
              Next up
            </h2>
            {next ? (
              <div className={styles.nextUp}>
                <Link
                  to="/play/$id"
                  params={{ id: next.puzzle.id }}
                  className={styles.nextSlot}
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <Slot
                    number={next.number}
                    width={next.puzzle.width}
                    height={next.puzzle.height}
                    gold={next.number === GOLD_SLOT}
                    next
                  />
                </Link>
                <div>
                  <p className={styles.nextName}>
                    #{next.number} {next.puzzle.title}
                  </p>
                  <p className={styles.nextWhere}>
                    {next.province.name} · {next.puzzle.width}×{next.puzzle.height}
                  </p>
                  <Link to="/play/$id" params={{ id: next.puzzle.id }} className={`${styles.pill} ${styles.pink}`}>
                    {next.fresh ? 'Start' : 'Continue'}
                  </Link>
                </div>
              </div>
            ) : (
              <p className={styles.empty}>Every slot is filled. The album is complete.</p>
            )}
          </section>
          <section className={styles.card} aria-labelledby="latest-title">
            <h2 id="latest-title" className={styles.label}>
              Latest stickers
            </h2>
            {latest.length > 0 ? (
              <div className={styles.latest}>
                {latest.slice(0, LATEST).map(s => (
                  <StickerLink key={s.puzzle.id} sticker={s} />
                ))}
              </div>
            ) : (
              <p className={styles.empty}>Solve a puzzle and its sticker lands here.</p>
            )}
          </section>
        </div>
      </div>

    </main>
  )
}

function StickerLink({ sticker: s, tilt, style }: { sticker: StickerEntry; tilt?: number; style?: CSSProperties }) {
  const { puzzle } = s
  return (
    <Link
      to="/play/$id"
      params={{ id: puzzle.id }}
      className={styles.stickerLink}
      style={style}
      aria-label={`#${s.number} ${puzzle.title}${s.unverified ? ', imported' : ''}`}
    >
      <Sticker
        title={puzzle.title}
        width={puzzle.width}
        height={puzzle.height}
        palette={s.palette ?? Array<null>(puzzle.width * puzzle.height).fill(null)}
        gold={s.number === GOLD_SLOT}
        unverified={s.unverified}
        foil={s.foil}
        tilt={tilt ?? tiltOf(puzzle.id)}
      />
    </Link>
  )
}
