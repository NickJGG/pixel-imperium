import { Link } from '@tanstack/react-router'
import type { Campaign, Province } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { type CampaignProgress, campaignProgress, isOpen } from './progress.ts'
import { PuzzleCard } from './PuzzleCard.tsx'
import styles from './Campaign.module.css'

export function ProvincePage({ campaign, province }: { campaign: Campaign; province: Province }) {
  const { storage } = useAccount()
  const progress = campaignProgress(campaign, storage)
  const { state, solved, total } = progress.provinces[campaign.provinces.indexOf(province)]!

  if (!isOpen(state)) return <LockedProvince campaign={campaign} province={province} progress={progress} />
  return (
    <main className={styles.page}>
      <BackToMap campaign={campaign} />
      <div className={styles.sec}>
        <h1 className={styles.heading}>{province.name}</h1>
        <span className={styles.count}>
          {solved}/{total}
        </span>
      </div>
      {state === 'conquered' && province.flavour && <p className={styles.flavour}>{province.flavour}</p>}
      <ul className={styles.grid}>
        {province.puzzles.map(p => (
          <li key={p.id}>
            <PuzzleCard puzzle={p} storage={storage} />
          </li>
        ))}
      </ul>
    </main>
  )
}

/** Shown in place of a province, or one of its puzzles, that the player hasn't reached. */
export function LockedProvince({
  campaign,
  province,
  progress,
}: {
  campaign: Campaign
  province: Province
  progress: CampaignProgress
}) {
  const index = campaign.provinces.indexOf(province)
  const active = campaign.provinces.find((_, i) => progress.provinces[i]!.state === 'active')
  return (
    <main className={styles.page}>
      <BackToMap campaign={campaign} />
      <h1 className={styles.heading}>Not yet</h1>
      <p className={styles.empty}>
        {progress.provinces[index]!.state === 'next' && active
          ? `${province.name} opens once you conquer ${active.name}.`
          : 'This province is still in the fog. Conquer the provinces before it first.'}
      </p>
    </main>
  )
}

function BackToMap({ campaign }: { campaign: Campaign }) {
  return (
    <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} className={styles.back}>
      ← {campaign.name}
    </Link>
  )
}
