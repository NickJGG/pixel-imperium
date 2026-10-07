import { type CSSProperties, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { Campaign, CampaignSummary } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { Journey } from './Journey.tsx'
import { markConquestsSeen, unseenConquests } from './conquests.ts'
import { campaignProgress } from './progress.ts'
import styles from './Campaign.module.css'
import mapStyles from './Journey.module.css'

interface Props {
  campaign: Campaign
  /** Every live campaign; the switcher shows only when there's more than one. */
  campaigns: CampaignSummary[]
}

export function CampaignPage(props: Props) {
  const { generation } = useAccount()
  return <CampaignView key={`${generation}:${props.campaign.id}`} {...props} />
}

function CampaignView({ campaign, campaigns }: Props) {
  const { storage } = useAccount()
  const [{ progress, conquests, from }] = useState(() => {
    const progress = campaignProgress(campaign, storage)
    const conquests = unseenConquests(campaign, progress, storage)
    return {
      progress,
      conquests,
      from:
        conquests.length > 0 ? conquests.map((_, k) => campaignProgress(campaign, storage, conquests.slice(k))) : undefined,
    }
  })
  const [swept, setSwept] = useState(!from)
  useEffect(() => markConquestsSeen(campaign, conquests, storage), [campaign, conquests, storage])

  const showClosing = progress.conquered && swept
  const announced = swept ? conquests.map(i => campaign.provinces[i]!) : []
  const last = conquests.at(-1)
  const { height, step } = campaign.journey
  // Between the latest conquest and the province it opened, or at the Throne's foot for the finale.
  const atFoot = showClosing || last === undefined
  const bannerAt = atFoot ? undefined : ({ '--y': (last * step + height + (last + 1) * step) / 2 } as CSSProperties)
  const activeIndex = progress.provinces.findIndex(p => p.state === 'active')
  const active = activeIndex === -1 ? undefined : { ...progress.provinces[activeIndex]!, ...campaign.provinces[activeIndex]! }
  const started = progress.provinces.some(p => p.solved > 0)

  return (
    <main className={styles.page}>
      <div className={styles.sec}>
        <div>
          <h1 className={styles.heading}>{campaign.name}</h1>
          {!progress.provinces.some(p => p.state === 'conquered') && (
            <p className={styles.goal}>Solve every puzzle in a province to conquer it and march on the next.</p>
          )}
        </div>
        {active && (
          <Link
            to="/c/$campaignId/$provinceId"
            params={{ campaignId: campaign.id, provinceId: active.id }}
            className={styles.continue}
          >
            {started ? 'Continue' : 'Start'}: {active.name}
            <span className={styles.continueCount}>
              {active.solved}/{active.total}
            </span>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        )}
        {campaigns.length > 1 && (
          <nav className={styles.switcher} aria-label="Campaigns">
            {campaigns.map(c => (
              <Link
                key={c.id}
                to="/c/$campaignId"
                params={{ campaignId: c.id }}
                aria-current={c.id === campaign.id ? 'page' : undefined}
              >
                {c.name}
              </Link>
            ))}
          </nav>
        )}
      </div>
      <Journey campaign={campaign} progress={progress} from={from} onSwept={() => setSwept(true)} linked>
        {(showClosing || announced.length > 0) && (
          <div className={`${mapStyles.banner} ${atFoot ? mapStyles.foot : ''}`} style={bannerAt} role="status">
            {announced.map(p => (
              <p key={p.id}>
                <strong>{p.name} conquered.</strong> {p.flavour}
              </p>
            ))}
            {showClosing && (
              <p className={mapStyles.closing}>{campaign.closingLine || `${campaign.name} is yours.`}</p>
            )}
          </div>
        )}
      </Journey>
    </main>
  )
}
