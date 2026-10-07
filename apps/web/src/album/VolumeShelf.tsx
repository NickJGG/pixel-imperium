import type { CSSProperties } from 'react'
import { Link } from '@tanstack/react-router'
import type { CampaignSummary } from '@pixel-imperium/protocol'
import styles from './VolumeShelf.module.css'

/** Every campaign as a volume's spine on a shelf, in its cover colour; the open one stands proud. */
export function VolumeShelf({ campaigns, current }: { campaigns: readonly CampaignSummary[]; current: string }) {
  return (
    <nav className={styles.shelf} aria-label="Volumes">
      {campaigns.map((c, i) => (
        <Link
          key={c.id}
          to="/c/$campaignId"
          params={{ campaignId: c.id }}
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
