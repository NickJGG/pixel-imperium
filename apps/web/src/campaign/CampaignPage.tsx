import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { Campaign, CampaignSummary } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { CampaignMap } from './CampaignMap.tsx'
import { markConquestsSeen, unseenConquests } from './conquests.ts'
import { campaignProgress } from './progress.ts'
import styles from './Campaign.module.css'
import mapStyles from './CampaignMap.module.css'

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
      from: conquests.length > 0 ? campaignProgress(campaign, storage, conquests) : undefined,
    }
  })
  const [swept, setSwept] = useState(!from)
  useEffect(() => markConquestsSeen(campaign, conquests, storage), [campaign, conquests, storage])

  const showClosing = progress.conquered && swept
  const announced = swept ? conquests.map(i => campaign.provinces[i]!) : []

  return (
    <main className={styles.page}>
      <div className={styles.sec}>
        <h1 className={styles.heading}>{campaign.name}</h1>
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
      <CampaignMap campaign={campaign} progress={progress} from={from} onSwept={() => setSwept(true)} linked>
        {(showClosing || announced.length > 0) && (
          <div className={mapStyles.banner} role="status">
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
      </CampaignMap>
    </main>
  )
}
