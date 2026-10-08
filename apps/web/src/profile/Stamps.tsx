import type { Campaign, ProfileStamp, StampId } from '@pixel-imperium/protocol'
import { Stamp } from '../album/Stamp.tsx'
import { shortDate } from './activity.ts'
import styles from './Profile.module.css'

const TILTS = [-12, 8, -6, 10, -9, 6, -4, 11, -8, 5, -10]

/** Every Stamp a volume offers, in `StampId` order, with its label. */
function stampsOf(campaign: Pick<Campaign, 'provinces'>): { id: StampId; label: string }[] {
  return [
    { id: 'first-sticker', label: 'First sticker' },
    { id: 'first-foil', label: 'First foil' },
    { id: 'foil-run', label: '5 foil in a row' },
    { id: 'spree', label: '10 in a day' },
    { id: 'perfect-page', label: 'Perfect page' },
    ...campaign.provinces.slice(0, -1).map(p => ({
      id: `conquered:${p.id}` as const,
      label: `${p.name.replace(/^The /, '')} conquered`,
    })),
    { id: 'album-complete', label: 'Album complete' },
  ]
}

interface Props {
  campaign: Pick<Campaign, 'provinces'>
  earned: readonly ProfileStamp[]
  now: Date
}

/** The volume's Stamps: earned ones dated, the rest faded and waiting. */
export function Stamps({ campaign, earned, now }: Props) {
  const at = new Map(earned.map(s => [s.id, s.earnedAt]))
  return (
    <ul className={styles.stamps}>
      {stampsOf(campaign).map(({ id, label }, i) => {
        const when = at.get(id)
        return (
          <li key={id} data-off={!when || undefined}>
            <Stamp
              tone={id === 'album-complete' ? 'gold' : 'pink'}
              tilt={when ? TILTS[i % TILTS.length]! : 0}
              className={styles.stamp}
            >
              {label}
            </Stamp>
            {when ? <time dateTime={when}>{shortDate(new Date(when), now)}</time> : 'Not yet'}
          </li>
        )
      })}
    </ul>
  )
}
