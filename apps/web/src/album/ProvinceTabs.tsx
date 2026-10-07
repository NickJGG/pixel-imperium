import { Link } from '@tanstack/react-router'
import type { Campaign } from '@pixel-imperium/protocol'
import { type CampaignProgress, isOpen } from '../campaign/progress.ts'
import { Lock } from './Lock.tsx'
import { paperStyle } from './paper.ts'
import styles from './ProvinceTabs.module.css'

interface Props {
  campaign: Campaign
  progress: CampaignProgress
  /** The province whose page is open. */
  current?: string | undefined
  /** Index tabs sticking out of the page's right edge, or a sideways-scrolling row of chips for phones. */
  variant: 'edge' | 'chips'
  className?: string | undefined
}

const shortName = (name: string) => name.replace(/^The /, '')

/** The album's index: one tab per province, greyed with a lock until the province opens. */
export function ProvinceTabs({ campaign, progress, current, variant, className }: Props) {
  const tabs = campaign.provinces.map((province, index) => ({ province, index, ...progress.provinces[index]! }))
  // A phone shows the open page's chip first, so it's always in view.
  if (variant === 'chips') tabs.sort((a, b) => Number(b.province.id === current) - Number(a.province.id === current))

  return (
    <nav className={[styles[variant], className].filter(Boolean).join(' ')} aria-label="Provinces">
      {tabs.map(({ province, index, state, solved, total }) => {
        const locked = !isOpen(state)
        const here = province.id === current
        return (
          <Link
            key={province.id}
            to="/c/$campaignId/$provinceId"
            params={{ campaignId: campaign.id, provinceId: province.id }}
            className={[styles.tab, locked && styles.locked].filter(Boolean).join(' ')}
            style={paperStyle(index)}
            aria-current={here ? 'page' : undefined}
            aria-label={locked ? `${province.name}, locked` : undefined}
          >
            {locked && <Lock />}
            {shortName(province.name)}
            {variant === 'chips' && here && !locked && (
              <span className={styles.count}>
                {solved}/{total}
              </span>
            )}
          </Link>
        )
      })}
    </nav>
  )
}
