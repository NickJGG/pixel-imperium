import type { CSSProperties } from 'react'
import type { Campaign } from '@pixel-imperium/protocol'
import { CampaignStack } from '../campaign/CampaignColumn.tsx'
import { World } from '../campaign/worlds/Worlds.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'

/** Home's way into the last-played campaign: its campaign column, paired with the album page it opens onto. */
export function CampaignColumn({
  campaign,
  storage,
  start,
  style,
}: {
  campaign: Campaign
  storage: ProgressStorage
  start: boolean
  style: CSSProperties
}) {
  return (
    <World paper={campaign.paper} labelledBy="home-campaign" style={style} start={start} pair>
      <CampaignStack campaign={campaign} storage={storage} titleId="home-campaign" />
    </World>
  )
}
