import { useParams } from '@tanstack/react-router'
import { type ReactNode, useRef } from 'react'
import { getAccount } from '../account.ts'
import { NewBadge } from '../album/NewBadge.tsx'
import { dayKey } from '../profile/activity.ts'
import { SrLoading } from '../skeleton/Skeleton.tsx'
import { CampaignStackSkeleton } from './CampaignColumn.tsx'
import { isFeatured, rowOrder, windowOf } from './campaigns.ts'
import { currentCampaign, currentCampaigns } from './last-campaign.ts'
import { startedCampaigns } from './started-campaigns.ts'
import { useAnnounceSkeleton } from './worlds/morph-nav.ts'
import {
  Backdrop,
  SkeletonCampaignStub,
  SkeletonSpine,
  World,
  Worlds,
  campaignMorphName,
  usePhone,
  useSpineReach,
} from './worlds/Worlds.tsx'
import styles from './Campaigns.module.css'

/**
 * Campaigns while it loads: the open column and the window of spines around it, in the order and papers of the
 * campaigns list last loaded, or a carousel on a phone. Without that list, the open column stands alone in the fog.
 * Its column and spines pair with the page it's leaving, so a morph can play into it.
 */
export function CampaignsSkeleton() {
  const { campaignId } = useParams({ from: '/c/$campaignId' })
  const phone = usePhone()
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)
  useAnnounceSkeleton()
  const cached = currentCampaign()
  const campaign = cached?.id === campaignId ? cached : null
  const list = currentCampaigns()
  const today = dayKey(new Date())
  const row = list && rowOrder(list, startedCampaigns(getAccount().storage), today)
  const at = row?.findIndex(c => c.id === campaignId) ?? -1
  const paper = campaign?.paper ?? row?.[at]?.paper ?? 'marches'

  const open = (
    <World key="page" paper={paper} fog={!campaign && at === -1} style={campaignMorphName(campaignId)} start pair>
      <CampaignStackSkeleton campaign={campaign} />
    </World>
  )
  const page = (body: ReactNode) => (
    <main ref={ref} className={styles.page} aria-busy="true">
      <SrLoading />
      <Backdrop paper={paper} />
      {body}
    </main>
  )

  if (!row || at === -1) return page(<Worlds>{open}</Worlds>)
  if (phone) {
    return page(
      <>
        <Worlds carousel>{row.map(c => (c.id === campaignId ? open : <World key={c.id} paper={c.paper} fog />))}</Worlds>
        <p className={styles.counter}>
          {at + 1} of {row.length}
        </p>
      </>,
    )
  }
  const { lo, hi } = windowOf(row.length, at)
  return page(
    <Worlds>
      {lo > 0 && <SkeletonCampaignStub hidden={lo} side="before" featured={row.slice(0, lo).some(c => isFeatured(c, today))} />}
      {row.slice(lo, hi).map((c, i) =>
        c.id === campaignId ? (
          open
        ) : (
          <SkeletonSpine
            key={c.id}
            paper={c.paper}
            state="active"
            pairs="campaign"
            before={lo + i < at}
            style={campaignMorphName(c.id)}
            name={c.name.replace(/^The /, '')}
          >
            {isFeatured(c, today) && <NewBadge />}
          </SkeletonSpine>
        ),
      )}
      {hi < row.length && (
        <SkeletonCampaignStub
          hidden={row.length - hi}
          side="after"
          featured={row.slice(hi).some(c => isFeatured(c, today))}
        />
      )}
    </Worlds>,
  )
}
