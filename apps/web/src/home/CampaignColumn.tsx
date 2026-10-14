import type { CSSProperties } from 'react'
import type { Campaign } from '@pixel-imperium/protocol'
import { CampaignStack } from '../campaign/CampaignColumn.tsx'
import { World } from '../campaign/worlds/Worlds.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'

/**
 * Home's way into a campaign, the last played or the Featured one: its campaign column, opening onto it on
 * Campaigns.
 */
export function CampaignColumn({
  campaign,
  storage,
  featured = false,
  start,
  style,
}: {
  campaign: Campaign
  storage: ProgressStorage
  /** The Featured campaign's column, rather than the last played's. */
  featured?: boolean
  start: boolean
  style: CSSProperties
}) {
  const titleId = featured ? 'home-featured' : 'home-campaign'
  return (
    <World paper={campaign.paper} labelledBy={titleId} style={style} start={start} pair>
      <CampaignStack
        campaign={campaign}
        storage={storage}
        titleId={titleId}
        opens="campaign"
        featured={featured ? 'home' : undefined}
      />
    </World>
  )
}
