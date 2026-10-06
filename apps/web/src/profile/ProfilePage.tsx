import { Link, getRouteApi } from '@tanstack/react-router'
import { useAccount } from '../account.ts'
import list from '../campaign/Campaign.module.css'
import styles from './Profile.module.css'

const route = getRouteApi('/u/$handle')

const joined = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

export function ProfilePage() {
  const profile = route.useLoaderData()
  const { account } = useAccount()
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

      {profile.verifiedSolves === 0 && <p className={list.empty}>Nothing solved yet.</p>}
    </main>
  )
}
