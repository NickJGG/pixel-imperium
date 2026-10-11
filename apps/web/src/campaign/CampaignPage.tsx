import { type CSSProperties, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { Campaign, CampaignSummary, Province } from '@pixel-imperium/protocol'
import { PlayIcon } from '../album/icons.tsx'
import { Stamp } from '../album/Stamp.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { useAccount } from '../account.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { type ProvinceProgress, campaignProgress, continueAt } from './progress.ts'
import { GOLD_SLOT, PuzzleSlot } from './PuzzleSlot.tsx'
import { type StickerEntry, latestStickers } from './stickers.ts'
import { Spine, World, Worlds } from './worlds/Worlds.tsx'
import styles from './Home.module.css'

interface Props {
  campaign: Campaign
  /**
   * Every live campaign. Only one is live, so home has no shelf of volumes yet; `VolumeShelf` comes back
   * here once there's more than one.
   */
  campaigns: CampaignSummary[]
}

/** A conquered province's collage holds this many of its stickers. */
const COLLAGE = 9

export function CampaignPage(props: Props) {
  const { generation } = useAccount()
  return <Overview key={`${generation}:${props.campaign.id}`} {...props} />
}

/**
 * Home: every province as a column. The active one is wide with its slots and Continue; a conquered one is a
 * collage of its stickers under the Conquered stamp; the next and the locked ones are thin spines in the fog.
 */
function Overview({ campaign }: Props) {
  const { storage } = useAccount()
  const [{ progress, latest }] = useState(() => ({
    progress: campaignProgress(campaign, storage),
    latest: latestStickers(campaign, storage),
  }))
  const next = continueAt(campaign, progress, id => storage.loadSolved(id) !== null)

  return (
    <main className={styles.home}>
      <h1 className={styles.srOnly}>{campaign.name}</h1>
      <Worlds>
        {campaign.provinces.map((province, index) => {
          const p = progress.provinces[index]!
          if (p.state === 'active') {
            return (
              <ActiveWorld
                key={province.id}
                campaign={campaign}
                province={province}
                index={index}
                progress={p}
                storage={storage}
                padDefault={next?.province === province}
              />
            )
          }
          return (
            <Spine
              key={province.id}
              campaignId={campaign.id}
              province={province}
              index={index}
              state={p.state}
              className={p.state === 'conquered' ? `${styles.conquered} ${progress.conquered ? styles.fill : ''}` : undefined}
            >
              {p.state === 'conquered' && (
                <>
                  <Collage stickers={latest.filter(s => s.province === index && s.palette !== null).slice(0, COLLAGE)} />
                  <Stamp className={styles.stamp}>Conquered</Stamp>
                </>
              )}
            </Spine>
          )
        })}
      </Worlds>
    </main>
  )
}

function ActiveWorld({
  campaign,
  province,
  index,
  progress: { solved, total },
  storage,
  padDefault,
}: {
  campaign: Campaign
  province: Province
  index: number
  progress: ProvinceProgress
  storage: ProgressStorage
  padDefault: boolean
}) {
  const next = province.puzzles.find(p => storage.loadSolved(p.id) === null)
  const number = next ? province.puzzles.indexOf(next) + 1 : 0
  const id = `province-${province.id}`
  return (
    <World index={index} className={styles.active} labelledBy={id}>
      <div className={styles.open}>
        <p className={styles.kicker}>
          Province {index + 1} · {solved} / {total} collected
        </p>
        <h2 id={id} className={styles.name}>
          {province.name}
        </h2>
        <p className={styles.theme}>{province.theme}</p>
        <div className={styles.mini}>
          {province.puzzles.map((p, i) => (
            <PuzzleSlot key={p.id} puzzle={p} number={i + 1} storage={storage} next={p === next} />
          ))}
        </div>
        <div className={styles.actions}>
          {next && (
            <Link
              to="/play/$id"
              params={{ id: next.id }}
              className={styles.continue}
              data-variant="primary"
              data-pad-default={padDefault || undefined}
            >
              <PlayIcon />
              {solved === 0 ? 'Start' : 'Continue'}
              <small>
                #{number} {next.title}
              </small>
            </Link>
          )}
          <Link
            to="/c/$campaignId/$provinceId"
            params={{ campaignId: campaign.id, provinceId: province.id }}
            className={styles.openLink}
            data-variant="paper"
          >
            Open {province.name.replace(/^The /, 'the ')}
          </Link>
        </div>
      </div>
    </World>
  )
}

/** A conquered province's stickers, slapped down in two loose columns. Decorative: the spine names it. */
function Collage({ stickers }: { stickers: StickerEntry[] }) {
  return (
    <span className={styles.collage} aria-hidden="true">
      {stickers.map((s, k) => (
        <span
          key={s.puzzle.id}
          className={styles.slap}
          style={{ '--x': `${(k % 2) * 46 + ((k * 7) % 14)}%`, '--y': `${k * 10}%` } as CSSProperties}
        >
          <Sticker
            title={s.puzzle.title}
            width={s.puzzle.width}
            height={s.puzzle.height}
            palette={s.palette!}
            gold={s.number === GOLD_SLOT}
            foil={s.foil}
            unverified={s.unverified}
            tilt={tiltOf(s.puzzle.id) * 2}
          />
        </span>
      ))}
    </span>
  )
}
