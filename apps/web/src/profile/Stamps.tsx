import type { ProfileStamp, StampId } from '@pixel-imperium/protocol'
import { type StampDef, StampToken, stampDef } from '../album/Stamp.tsx'
import { shortDate } from './activity.ts'
import { type ProfileAlbum, albumPages } from './album.ts'
import styles from './Profile.module.css'

const FIRSTS: StampId[] = ['first-sticker', 'first-foil', 'foil-run']

/** Every Stamp a volume offers, in `StampId` order: a Year has no spree, and a Stamp for each Month it has Dailies in. */
export function stampsOf(album: ProfileAlbum): StampDef[] {
  const ids: StampId[] =
    album.kind === 'year'
      ? [
          ...FIRSTS,
          'perfect-page',
          ...albumPages(album, () => false).map(page => `month-complete:${page.id}` as const),
          'year-complete',
        ]
      : [
          ...FIRSTS,
          'spree',
          'perfect-page',
          ...album.campaign.provinces.slice(0, -1).map(p => `conquered:${p.id}` as const),
          'album-complete',
        ]
  return ids.map(id => stampDef(id, album.kind === 'campaign' ? album.campaign : undefined))
}

interface Props {
  album: ProfileAlbum
  earned: readonly ProfileStamp[]
  now: Date
}

/** The volume's Stamps as round tokens: earned ones filled and dated, the rest dashed and waiting. */
export function Stamps({ album, earned, now }: Props) {
  const at = new Map(earned.map(s => [s.id, s.earnedAt]))
  return (
    <ul className={styles.stamps}>
      {stampsOf(album).map(stamp => {
        const when = at.get(stamp.id)
        return (
          <li key={stamp.id} data-off={!when || undefined}>
            <StampToken stamp={stamp} off={!when} />
            <span className={styles.stampLabel}>{stamp.label}</span>
            {when ? <time dateTime={when}>{shortDate(new Date(when), now)}</time> : 'Not yet'}
          </li>
        )
      })}
    </ul>
  )
}
