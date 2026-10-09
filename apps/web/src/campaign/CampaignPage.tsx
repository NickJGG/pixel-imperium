import { type CSSProperties, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { Campaign, CampaignSummary } from '@pixel-imperium/protocol'
import { Sticker } from '../album/Sticker.tsx'
import { VolumeShelf } from '../album/VolumeShelf.tsx'
import { useAccount } from '../account.ts'
import { LearnCard } from '../tutorial/LearnCard.tsx'
import { campaignProgress, continueAt, techniquesRecommended } from './progress.ts'
import { ProvinceIndex } from './ProvinceIndex.tsx'
import { ProvinceSpread } from './ProvincePage.tsx'
import { GOLD_SLOT } from './PuzzleSlot.tsx'
import { SHOWCASE_SIZE, type StickerEntry, coverStickers, latestStickers, showcaseOf } from './stickers.ts'
import { ThisWeek } from './ThisWeek.tsx'
import styles from './Cover.module.css'

interface Props {
  campaign: Campaign
  /** Every live campaign; the shelf of volumes shows only when there's more than one. */
  campaigns: CampaignSummary[]
}

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

/** Home, the desk: the album's cover as a band, the active province's spread, and this week and Learn beside it. */
function Cover({ campaign, campaigns }: Props) {
  const { storage, account } = useAccount()
  const [{ progress, latest, now }] = useState(() => ({
    progress: campaignProgress(campaign, storage),
    latest: latestStickers(campaign, storage),
    now: new Date(),
  }))
  const isSolved = (id: string) => storage.loadSolved(id) !== null
  const next = continueAt(campaign, progress, isSolved)
  const solved = progress.provinces.reduce((n, p) => n + p.solved, 0)
  const total = progress.provinces.reduce((n, p) => n + p.total, 0)
  const foil = latest.filter(s => s.foil && !s.unverified).length
  const showcase = showcaseOf(coverStickers(latest), storage.loadShowcase(), account ? SHOWCASE_SIZE : 2).stickers
  const province = next?.province ?? campaign.provinces.at(-1)

  return (
    <main className={styles.page}>
      <section className={styles.cover} aria-labelledby="cover-title">
        <div className={styles.band}>
          <div className={styles.coverTitle}>
            <h1 id="cover-title" className={styles.title}>
              <span>Pixel</span> Imperium
            </h1>
            <p className={styles.volume}>Sticker album · {campaign.name}</p>
          </div>
          <div className={styles.stats}>
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
          </div>
          <div className={styles.slaps}>
            {showcase.length > 0
              ? showcase.map((s, i) => (
                  <StickerLink key={s.puzzle.id} sticker={s} {...SLAPS[i]!} />
                ))
              : next?.fresh && (
                  <Link to="/play/$id" params={{ id: next.puzzle.id }} className={styles.startHere}>
                    Start here
                  </Link>
                )}
          </div>
        </div>
        <ProvinceIndex
          campaign={campaign}
          progress={progress}
          layout="row"
          name={p => (
            <Link to="/c/$campaignId/$provinceId" params={{ campaignId: campaign.id, provinceId: p.id }}>
              {p.name.replace(/^The /, '')}
            </Link>
          )}
        />
      </section>
      {campaigns.length > 1 && <VolumeShelf campaigns={campaigns} current={campaign.id} />}

      <div className={styles.desk}>
        {province && (
          <ProvinceSpread
            campaign={campaign}
            province={province}
            progress={progress}
            storage={storage}
            caption={progress.conquered ? campaign.closingLine : undefined}
          />
        )}
        <div className={styles.side}>
          {latest.length > 0 && <ThisWeek campaign={campaign} storage={storage} stickers={latest} foil={foil} now={now} />}
          <LearnCard recommended={techniquesRecommended(campaign, progress)} />
        </div>
      </div>
    </main>
  )
}

function StickerLink({ sticker: s, tilt, width }: { sticker: StickerEntry; tilt: number; width: number }) {
  const { puzzle } = s
  return (
    <Link
      to="/play/$id"
      params={{ id: puzzle.id }}
      className={styles.stickerLink}
      style={{ '--w': `${width}px` } as CSSProperties}
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
        tilt={tilt}
      />
    </Link>
  )
}
