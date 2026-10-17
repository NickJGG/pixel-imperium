import { useNavigate } from '@tanstack/react-router'
import { useRef, useState } from 'react'
import type { Campaign, CampaignSummary, Profile } from '@pixel-imperium/protocol'
import { NewBadge } from '../album/NewBadge.tsx'
import { useAccount } from '../account.ts'
import { dayKey } from '../profile/activity.ts'
import { useHudTrail } from '../Trail.tsx'
import { campaignTrail } from '../trails.ts'
import { CampaignStack } from './CampaignColumn.tsx'
import { isFeatured, jump, rowOrder, windowOf } from './campaigns.ts'
import { useStartedCampaigns } from './started-campaigns.ts'
import {
  Backdrop,
  CampaignSpine,
  CampaignStub,
  World,
  Worlds,
  campaignMorphName,
  usePhone,
  useSpineReach,
  useStep,
} from './worlds/Worlds.tsx'
import homeStyles from '../home/Home.module.css'
import styles from './Campaigns.module.css'

/**
 * Campaigns: every campaign as a spine in one row, the one in the URL open as its campaign column. On a desktop
 * only a window of the row shows, with a stub at either edge counting the rest; on a phone, a carousel holds them
 * all. Moving to another campaign (a spine, a stub, a swipe, ←/→, LB/RB) replaces this page in history.
 */
export function CampaignsPage({
  campaigns,
  campaign,
  profile,
}: {
  campaigns: readonly CampaignSummary[]
  campaign: Campaign
  /** The signed-in player's, whose started campaigns count beside this device's. */
  profile: Profile | null
}) {
  const { account, storage } = useAccount()
  const navigate = useNavigate()
  const phone = usePhone()
  const own = account && profile?.handle.toLowerCase() === account.handle.toLowerCase() ? profile : null
  const started = useStartedCampaigns(storage, own?.campaigns.map(c => c.id))
  const [today] = useState(() => dayKey(new Date()))
  const listed = campaigns.some(c => c.id === campaign.id) ? campaigns : [summaryOf(campaign), ...campaigns]
  const row = rowOrder(listed, started, today)
  const at = row.findIndex(c => c.id === campaign.id)

  const anyFeatured = (cs: readonly CampaignSummary[]) => cs.some(c => isFeatured(c, today))

  const goTo = (i: number) => {
    const to = row[i]
    if (!to || i === at) return
    void navigate({ to: '/c/$campaignId', params: { campaignId: to.id }, replace: true })
  }
  useStep(dir => goTo(at + dir))
  useHudTrail(campaignTrail(campaign))
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)

  const titleId = `campaign-${campaign.id}`
  const open = (
    <World key={campaign.id} paper={campaign.paper} labelledBy={titleId} style={campaignMorphName(campaign.id)} start pair>
      <CampaignStack
        campaign={campaign}
        storage={storage}
        titleId={titleId}
        featured={isFeatured(campaign, today) ? 'row' : undefined}
      />
    </World>
  )

  if (phone) {
    return (
      <main ref={ref} className={styles.page}>
        <h1 className={homeStyles.srOnly}>Campaigns</h1>
        <Backdrop paper={campaign.paper} />
        <Worlds carousel onSnap={goTo}>
          {row.map(c => (c.id === campaign.id ? open : <Unopened key={c.id} campaign={c} featured={isFeatured(c, today)} />))}
        </Worlds>
        <p className={styles.counter}>
          {at + 1} of {row.length}
        </p>
      </main>
    )
  }
  const { lo, hi } = windowOf(row.length, at)
  return (
    <main ref={ref} className={styles.page}>
      <h1 className={homeStyles.srOnly}>Campaigns</h1>
      <Backdrop paper={campaign.paper} />
      <Worlds>
        {lo > 0 && (
          <CampaignStub to={row[jump(at, -1, row.length)]!.id} hidden={lo} side="before" featured={anyFeatured(row.slice(0, lo))} />
        )}
        {row.slice(lo, hi).map((c, i) =>
          c.id === campaign.id ? (
            open
          ) : (
            <CampaignSpine key={c.id} campaign={c} before={lo + i < at} featured={isFeatured(c, today)} />
          ),
        )}
        {hi < row.length && (
          <CampaignStub
            to={row[jump(at, 1, row.length)]!.id}
            hidden={row.length - hi}
            side="after"
            featured={anyFeatured(row.slice(hi))}
          />
        )}
      </Worlds>
    </main>
  )
}

const summaryOf = (campaign: Campaign): CampaignSummary => ({
  id: campaign.id,
  name: campaign.name,
  ...(campaign.released !== undefined && { released: campaign.released }),
  paper: campaign.paper,
  total: campaign.provinces.reduce((n, p) => n + p.puzzles.length, 0),
})

/** A carousel's neighbour, known only by its summary until the carousel rests on it and it loads. */
function Unopened({ campaign, featured }: { campaign: CampaignSummary; featured: boolean }) {
  const titleId = `campaign-${campaign.id}`
  return (
    <World paper={campaign.paper} labelledBy={titleId} style={campaignMorphName(campaign.id)}>
      <div className={homeStyles.column}>
        <div className={homeStyles.stack}>
          <p className={homeStyles.kicker}>
            Campaign · {featured && <><NewBadge /> · </>}
            {campaign.total} puzzles
          </p>
          <h2 id={titleId} className={homeStyles.hero}>
            {campaign.name}
          </h2>
        </div>
      </div>
    </World>
  )
}
