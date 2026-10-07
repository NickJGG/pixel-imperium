import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import type { CampaignSummary } from '@pixel-imperium/protocol'
import styles from './VolumeShelf.module.css'

interface Props {
  campaigns: readonly CampaignSummary[]
  current: string
  /** Shelves that player's volumes on their profile instead of opening the campaigns. */
  handle?: string | undefined
}

/** Every campaign as a volume's spine on a shelf, in its cover colour; the open one stands proud. */
export function VolumeShelf({ campaigns, current, handle }: Props) {
  return (
    <nav className={styles.shelf} aria-label="Volumes">
      {campaigns.map((c, i) => (
        <Link
          key={c.id}
          {...(handle === undefined
            ? { to: '/c/$campaignId', params: { campaignId: c.id } }
            : { to: '/u/$handle', params: { handle }, search: { c: c.id } })}
          className={styles.spine}
          style={{ '--spine': c.coverColour ?? 'var(--cover)' } as CSSProperties}
          aria-current={c.id === current ? 'page' : undefined}
        >
          <span className={styles.no}>{i + 1}</span>
          <span className={styles.name}>{c.name}</span>
        </Link>
      ))}
    </nav>
  )
}
