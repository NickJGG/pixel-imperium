import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import type { Campaign, Province } from '@pixel-imperium/protocol'
import { Lock } from '../album/Lock.tsx'
import { paperStyle } from '../album/paper.ts'
import { ProvinceTabs } from '../album/ProvinceTabs.tsx'
import { Spread } from '../album/Spread.tsx'
import { useAccount } from '../account.ts'
import { type CampaignProgress, campaignProgress, isOpen } from './progress.ts'
import { PuzzleSlot } from './PuzzleSlot.tsx'
import styles from './Campaign.module.css'

export function ProvincePage({ campaign, province }: { campaign: Campaign; province: Province }) {
  const { storage } = useAccount()
  const progress = campaignProgress(campaign, storage)
  const index = campaign.provinces.indexOf(province)
  const { state, solved } = progress.provinces[index]!
  const next = state === 'active' ? province.puzzles.find(p => storage.loadSolved(p.id) === null) : undefined

  if (!isOpen(state)) return <LockedProvince campaign={campaign} province={province} progress={progress} />
  return (
    <Indexed campaign={campaign} province={province} progress={progress}>
      <BackToCover campaign={campaign} />
      <Spread
        province={province}
        index={index}
        solved={solved}
        complete={state === 'conquered'}
        caption={(state === 'conquered' && province.flavour) || undefined}
        slot={(p, number) => <PuzzleSlot puzzle={p} number={number} storage={storage} next={p === next} />}
      />
    </Indexed>
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
  const sizes = [...province.puzzles].sort((a, b) => a.width * a.height - b.width * b.height).map(p => `${p.width}×${p.height}`)
  const range = sizes.length === 0 ? '' : sizes[0] === sizes.at(-1) ? sizes[0] : `${sizes[0]} to ${sizes.at(-1)}`

  return (
    <Indexed campaign={campaign} province={province} progress={progress}>
      <BackToCover campaign={campaign} />
      <section className={styles.locked} style={paperStyle(index)} aria-labelledby="locked-title">
        <div className={styles.sealed} aria-hidden="true">
          <div className={styles.ghosts}>
            {province.puzzles.map(p => (
              <i key={p.id} />
            ))}
          </div>
          <div className={styles.seal}>
            <span>
              <Lock className={styles.sealLock} />
              Locked
            </span>
          </div>
        </div>
        <div className={styles.lockedMsg}>
          <h1 id="locked-title" className={styles.lockedName}>
            {province.name}
          </h1>
          <span className={styles.lockBadge}>
            <Lock />
            Locked
          </span>
          <p>
            {progress.provinces[index]!.state === 'next' && active
              ? `${province.name} opens once you conquer ${active.name}.`
              : 'This province is still in the fog. Conquer the provinces before it first.'}
            {range && ` ${province.puzzles.length} slots, ${range}.`}
          </p>
          {active && (
            <Link
              to="/c/$campaignId/$provinceId"
              params={{ campaignId: campaign.id, provinceId: active.id }}
              className={styles.paperLink}
            >
              Back to {active.name.replace(/^The /, 'the ')}
            </Link>
          )}
        </div>
      </section>
    </Indexed>
  )
}

/** A province's page with the album's index tabs: chips above it on phones, tabs off its right edge otherwise. */
function Indexed({
  campaign,
  province,
  progress,
  children,
}: {
  campaign: Campaign
  province: Province
  progress: CampaignProgress
  children: ReactNode
}) {
  return (
    <main className={styles.page}>
      <ProvinceTabs campaign={campaign} progress={progress} current={province.id} variant="chips" className={styles.chipRail} />
      <div className={styles.indexed}>
        <div>{children}</div>
        <ProvinceTabs campaign={campaign} progress={progress} current={province.id} variant="edge" className={styles.edgeRail} />
      </div>
    </main>
  )
}

function BackToCover({ campaign }: { campaign: Campaign }) {
  return (
    <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} className={styles.back}>
      ← {campaign.name}
    </Link>
  )
}
