import { useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import type { Campaign } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { useAccount } from '../account.ts'
import { campaignProgress, techniquesRecommended } from '../campaign/progress.ts'
import { useLessonsDone } from './done.ts'
import { TRACKS, startedTrack } from './tracks.ts'
import styles from './Learn.module.css'

/**
 * Opens Learn, which hands back to `back`. Tagged New once `campaign` recommends the Techniques and
 * none of them is done yet.
 */
export function HowToPlay({ back, campaign, className }: { back: string; campaign: Campaign; className: string | undefined }) {
  const { storage } = useAccount()
  const recommended = useMemo(() => techniquesRecommended(campaign, campaignProgress(campaign, storage)), [campaign, storage])
  const done = useLessonsDone()
  const fresh = recommended && !startedTrack(TRACKS.techniques, done)
  return (
    <Link to="/learn" search={{ back }} className={className} data-variant="paper">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" />
      </svg>
      How to play
      {fresh && (
        <Dymo tone="pink" tilt={-3} className={styles.newTag}>
          New
        </Dymo>
      )}
    </Link>
  )
}
