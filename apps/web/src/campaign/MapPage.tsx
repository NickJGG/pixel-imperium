import { type CSSProperties, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import type { Campaign } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { Journey } from './Journey.tsx'
import { previewConquest } from './conquest-preview.ts'
import { markConquestsSeen, unseenConquests } from './conquests.ts'
import { campaignProgress } from './progress.ts'
import { crestsOf } from './stickers.ts'
import styles from './Campaign.module.css'

interface Props {
  campaign: Campaign
  /** Dev only: a province whose conquest to preview; see `conquest-preview.ts`. */
  conquer?: string | undefined
}

/** The album's endpaper: the campaign's Journey, where conquests not yet seen play out. */
export function MapPage({ campaign, conquer }: Props) {
  const { generation } = useAccount()
  return <MapView key={`${generation}:${campaign.id}:${conquer}`} campaign={campaign} conquer={conquer} />
}

function MapView({ campaign, conquer }: Props) {
  const { storage } = useAccount()
  const [{ progress, conquests, from, crests, preview }] = useState(() => {
    const preview = import.meta.env.DEV && conquer ? previewConquest(campaign, conquer, crestsOf(campaign, storage)) : null
    if (preview) return { ...preview, preview: true }
    const progress = campaignProgress(campaign, storage)
    const conquests = unseenConquests(campaign, progress, storage)
    return {
      progress,
      conquests,
      from:
        conquests.length > 0 ? conquests.map((_, k) => campaignProgress(campaign, storage, conquests.slice(k))) : undefined,
      crests: crestsOf(campaign, storage),
      preview: false,
    }
  })
  const [swept, setSwept] = useState(!from)
  useEffect(() => {
    if (!preview) markConquestsSeen(campaign, conquests, storage)
  }, [campaign, conquests, storage, preview])

  const showClosing = progress.conquered && swept
  const announced = swept ? conquests.map(i => campaign.provinces[i]!) : []
  const last = conquests.at(-1)
  const { height, step } = campaign.journey
  // Between the latest conquest and the province it opened, or at the Throne's foot for the finale.
  const atFoot = showClosing || last === undefined
  const bannerAt = atFoot ? undefined : ({ '--y': (last * step + height + (last + 1) * step) / 2 } as CSSProperties)

  return (
    <main className={styles.page}>
      <div className={styles.mapHead}>
        <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} className={styles.back}>
          ← Cover
        </Link>
        <h1 className={styles.mapTitle}>{campaign.name}</h1>
        {!progress.provinces.some(p => p.state === 'conquered') && (
          <p className={styles.goal}>Fill every slot in a province to conquer it and march on the next.</p>
        )}
      </div>
      <Journey
        campaign={campaign}
        progress={progress}
        from={from}
        onSwept={() => setSwept(true)}
        crests={crests}
        linked
      >
        {(showClosing || announced.length > 0) && (
          <div className={`${styles.banner} ${atFoot ? styles.foot : ''}`} style={bannerAt} role="status">
            {announced.map(p => (
              <p key={p.id}>
                <strong>{p.name} conquered.</strong> {p.flavour}
              </p>
            ))}
            {showClosing && <p className={styles.closing}>{campaign.closingLine || `${campaign.name} is yours.`}</p>}
          </div>
        )}
      </Journey>
    </main>
  )
}
