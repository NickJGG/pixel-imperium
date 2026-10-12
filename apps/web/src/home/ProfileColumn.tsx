import { Link } from '@tanstack/react-router'
import { type CSSProperties, useMemo, useState } from 'react'
import type { Campaign, Profile } from '@pixel-imperium/protocol'
import { HandleHero } from '../album/HandleHero.tsx'
import { profileStickers, showcaseOf } from '../campaign/stickers.ts'
import { World } from '../campaign/worlds/Worlds.tsx'
import { solveTimes } from '../daily/clock.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { streakOf, weekOf } from '../profile/activity.ts'
import { Showcase } from '../profile/Showcase.tsx'
import styles from './Home.module.css'

const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })

/**
 * Home's way into your profile, in its cobalt: your handle, this week's solves, and your showcase beside them.
 * It counts Verified solves, as the profile does, so the two agree; until the profile has loaded it shows none.
 */
export function ProfileColumn({
  handle,
  profile,
  campaign,
  storage,
  className,
  start,
  style,
}: {
  handle: string
  profile: Profile | null
  campaign: Campaign
  storage: ProgressStorage
  className: string | undefined
  start: boolean
  style: CSSProperties
}) {
  const [now] = useState(() => new Date())
  const times = useMemo(() => (profile ? solveTimes([...profile.campaigns, ...profile.years]) : []), [profile])
  const stickers = useMemo(() => {
    const entry = profile?.campaigns.find(c => c.id === campaign.id)
    return entry ? profileStickers(campaign, entry, storage) : []
  }, [profile, campaign, storage])
  const showcase = showcaseOf(stickers, profile?.showcase ?? []).stickers
  const days = weekOf(times, now)
  const streak = streakOf(times, now).current
  const solved = days.reduce((n, d) => n + d.count, 0)

  return (
    <World index={0} className={className} labelledBy="home-profile" style={style} start={start}>
      <div className={styles.column} data-surface="cobalt">
        <div className={styles.stack}>
          <p className={styles.kicker}>Profile</p>
          <HandleHero as="h2" id="home-profile" handle={handle} />
          <div className={styles.week}>
            <p className={styles.kicker}>
              This week{streak > 0 && ` · ${streak}-day streak`}
            </p>
            <div role="img" aria-label={`${solved} ${solved === 1 ? 'sticker' : 'stickers'} in the last seven days`}>
              {days.map(d => (
                <span key={d.key}>
                  <i style={{ '--h': `${(d.level / 3) * 100}%` } as CSSProperties} />
                  {weekday.format(new Date(`${d.key}T00:00`))}
                </span>
              ))}
            </div>
          </div>
          <div className={styles.actions}>
            <Link to="/u/$handle" params={{ handle }} data-variant="paper" data-pad-default>
              Open your profile
            </Link>
            {stickers.length > 0 && (
              <Link to="/u/$handle" params={{ handle }} search={{ c: campaign.id, edit: true }} data-variant="flat">
                Edit showcase
              </Link>
            )}
          </div>
        </div>
        <div className={styles.picture}>
          <Showcase stickers={showcase} className={styles.showcase} />
        </div>
      </div>
    </World>
  )
}
