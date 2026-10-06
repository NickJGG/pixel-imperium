import { Link } from '@tanstack/react-router'
import type { Campaign } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { type CampaignProgress, campaignProgress, isOpen } from './progress.ts'
import styles from './Campaign.module.css'

export function CampaignPage({ campaign }: { campaign: Campaign }) {
  const { storage } = useAccount()
  const progress = campaignProgress(campaign, storage)
  return (
    <main className={styles.page}>
      <div className={styles.sec}>
        <h1 className={styles.heading}>{campaign.name}</h1>
      </div>
      <ProvinceList campaign={campaign} progress={progress} />
    </main>
  )
}

const STATE_LABEL = { locked: 'Locked', next: 'Next', active: 'Active', conquered: 'Conquered' }

/** Every province with its state; a locked one stays unnamed, as it is fogged on the map. */
export function ProvinceList({ campaign, progress }: { campaign: Campaign; progress: CampaignProgress }) {
  return (
    <ol className={styles.provinces}>
      {campaign.provinces.map((province, i) => {
        const { state, solved, total } = progress.provinces[i]!
        const name = state === 'locked' ? 'Unknown province' : province.name
        return (
          <li key={province.id} data-state={state}>
            {isOpen(state) ? (
              <Link to="/c/$campaignId/$provinceId" params={{ campaignId: campaign.id, provinceId: province.id }}>
                {name}
              </Link>
            ) : (
              <span>{name}</span>
            )}
            <span className={styles.size}>
              {STATE_LABEL[state]}
              {state === 'active' && ` · ${solved}/${total}`}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
