import { Link } from '@tanstack/react-router'
import type { Campaign, Province } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { isConquestSeen } from './conquests.ts'
import { ProvinceMap } from './Journey.tsx'
import { type CampaignProgress, campaignProgress, isOpen } from './progress.ts'
import { PuzzleCard } from './PuzzleCard.tsx'
import styles from './Campaign.module.css'

export function ProvincePage({ campaign, province }: { campaign: Campaign; province: Province }) {
  const { storage } = useAccount()
  const progress = campaignProgress(campaign, storage)
  const index = campaign.provinces.indexOf(province)
  const { state, solved, total } = progress.provinces[index]!
  // Its colour waits for the conquest to play out on the campaign map.
  const claimed = state === 'conquered' && isConquestSeen(campaign, index, storage)

  if (!isOpen(state)) return <LockedProvince campaign={campaign} province={province} progress={progress} />
  return (
    <main className={styles.page}>
      <BackToMap campaign={campaign} />
      <ProvinceMap campaign={campaign} index={index} look={claimed ? 'colour' : 'mono'} />
      <div className={styles.sec}>
        <h1 className={styles.heading}>{province.name}</h1>
        <span className={styles.count}>
          {solved}/{total}
        </span>
      </div>
      {claimed && province.flavour && <p className={styles.flavour}>{province.flavour}</p>}
      {state === 'conquered' && !claimed && (
        <p className={styles.flavour}>All {province.puzzles.length} solved. Head back to the map to claim it.</p>
      )}
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
