import { useMemo } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { useAccount } from '../account.ts'
import { CampaignMap } from '../campaign/CampaignMap.tsx'
import { provinceStates } from '../campaign/progress.ts'
import list from '../campaign/Campaign.module.css'
import styles from './Profile.module.css'

const route = getRouteApi('/u/$handle')

const joined = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

export function ProfilePage() {
  const { profile, campaign, started } = route.useLoaderData()
  const { account } = useAccount()
  const progress = useMemo(() => {
    if (!campaign) return null
    const verified = new Set(profile.campaigns.find(c => c.id === campaign.id)?.verifiedPuzzleIds)
    return provinceStates(campaign, id => verified.has(id))
  }, [profile, campaign])
  const own = account?.handle.toLowerCase() === profile.handle.toLowerCase()

  return (
    <main className={list.page}>
      <header className={styles.header}>
        {profile.image ? (
          <img className={styles.avatar} src={profile.image} alt="" referrerPolicy="no-referrer" />
        ) : (
          <span className={styles.avatar} aria-hidden="true">
            {profile.handle[0]?.toUpperCase()}
          </span>
        )}
        <div>
          <h1 className={list.heading}>@{profile.handle}</h1>
          <p className={styles.meta}>
            {profile.verifiedSolves} solved · joined {joined.format(new Date(profile.joinedAt))}
            {own && (
              <>
                {' · '}
                <Link to="/settings">Settings</Link>
              </>
            )}
          </p>
        </div>
      </header>

      {started.length > 1 && campaign && (
        <nav className={`${list.switcher} ${styles.switcher}`} aria-label="Campaigns">
          {started.map(c => (
            <Link
              key={c.id}
              to="/u/$handle"
              params={{ handle: profile.handle }}
              search={{ c: c.id }}
              aria-current={c.id === campaign.id ? 'page' : undefined}
            >
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      {campaign && progress && <CampaignMap key={campaign.id} campaign={campaign} progress={progress} />}
    </main>
  )
}
