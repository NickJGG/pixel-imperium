import type { CSSProperties } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { useAccount } from '../account.ts'
import { PixelArt } from '../list/PixelArt.tsx'
import list from '../list/PuzzleList.module.css'
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

      {profile.gallery.length === 0 ? (
        <p className={list.empty}>Nothing solved yet.</p>
      ) : (
        <ul className={list.grid}>
          {profile.gallery.map(item => (
            <li key={item.puzzleId}>
              <Link to="/play/$id" params={{ id: item.puzzleId }} className={list.card}>
                <div className={`${list.thumb} ${item.palette ? list.solved : list.new}`}>
                  {item.palette ? (
                    <PixelArt title={item.title} width={item.width} height={item.height} palette={item.palette} />
                  ) : (
                    <div
                      className={`${list.box} ${list.blank}`}
                      style={{ '--w': item.width, '--h': item.height } as CSSProperties}
                      role="img"
                      aria-label={`${item.title}, hidden until you solve it`}
                    />
                  )}
                </div>
                <div className={list.info}>
                  <span className={list.title}>{item.title}</span>
                  <span className={list.size}>
                    {item.width}×{item.height}
                  </span>
                </div>
                {!item.verified && <span className={list.note}>Imported — replay to verify</span>}
                {item.verified && !item.palette && <span className={list.note}>Solve it to see the picture</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
