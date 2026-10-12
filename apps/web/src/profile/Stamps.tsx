import type { CSSProperties, ReactNode } from 'react'
import type { Campaign, ProfileStamp, StampId } from '@pixel-imperium/protocol'
import { BoltIcon, CheckIcon, CrownIcon, FlameIcon, PageStarIcon, SparkleIcon, StickerIcon } from '../album/icons.tsx'
import { paperStyle } from '../album/paper.ts'
import { shortDate } from './activity.ts'
import styles from './Profile.module.css'

interface StampDef {
  id: StampId
  label: string
  icon: ReactNode
  tone: 'pink' | 'foil' | 'tab' | 'gold'
  style?: CSSProperties
}

/** Every Stamp a volume offers, in `StampId` order. */
function stampsOf(campaign: Pick<Campaign, 'provinces'>): StampDef[] {
  return [
    { id: 'first-sticker', label: 'First sticker', icon: <StickerIcon />, tone: 'pink' },
    { id: 'first-foil', label: 'First foil', icon: <SparkleIcon />, tone: 'foil' },
    { id: 'foil-run', label: '5 foil in a row', icon: <FlameIcon />, tone: 'foil' },
    { id: 'spree', label: '10 in a day', icon: <BoltIcon />, tone: 'pink' },
    { id: 'perfect-page', label: 'Perfect page', icon: <PageStarIcon />, tone: 'foil' },
    ...campaign.provinces.slice(0, -1).map((p, i) => ({
      id: `conquered:${p.id}` as const,
      label: `${p.name.replace(/^The /, '')} conquered`,
      icon: <CheckIcon />,
      tone: 'tab' as const,
      style: paperStyle(i),
    })),
    { id: 'album-complete', label: 'Album complete', icon: <CrownIcon />, tone: 'gold' },
  ]
}

interface Props {
  campaign: Pick<Campaign, 'provinces'>
  earned: readonly ProfileStamp[]
  now: Date
}

/** The volume's Stamps as round tokens: earned ones filled and dated, the rest dashed and waiting. */
export function Stamps({ campaign, earned, now }: Props) {
  const at = new Map(earned.map(s => [s.id, s.earnedAt]))
  return (
    <ul className={styles.stamps}>
      {stampsOf(campaign).map(({ id, label, icon, tone, style }) => {
        const when = at.get(id)
        return (
          <li key={id} data-off={!when || undefined}>
            <span className={styles.token} data-tone={tone} style={style}>
              {icon}
            </span>
            <span className={styles.stampLabel}>{label}</span>
            {when ? <time dateTime={when}>{shortDate(new Date(when), now)}</time> : 'Not yet'}
          </li>
        )
      })}
    </ul>
  )
}
