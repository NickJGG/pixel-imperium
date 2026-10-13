import type { Campaign, SolveStamps, StampId } from '@pixel-imperium/protocol'
import { StampToken, stampDef } from '../album/Stamp.tsx'
import styles from './Play.module.css'

const SHOWN = 3

interface Props {
  stamps: SolveStamps
  /** The puzzle's, to name a province's Stamp; a Daily has none. */
  campaign: Campaign | undefined
  /** This solve was a regular sticker, so a foil run at 0 has just been broken. */
  regular: boolean
}

/**
 * The solved rail's Stamps: what the solve earned, biggest first, then the nearest still to earn, up to three in all.
 */
export function RailStamps({ stamps, campaign, regular }: Props) {
  const tokens: { id: StampId; note: string; off?: true }[] = [
    ...stamps.earned.toReversed().map(id => ({ id, note: 'Today' })),
    ...stamps.near.map(({ id, have, need }) => ({
      id,
      note: `${id === 'foil-run' && have === 0 && regular ? 'Back to ' : ''}${have} / ${need}`,
      off: true as const,
    })),
  ].slice(0, SHOWN)
  if (tokens.length === 0) return null
  return (
    <section className={styles.railSection} aria-labelledby="rail-stamps">
      <h2 id="rail-stamps">Stamps</h2>
      <ul className={styles.railStamps}>
        {tokens.map(({ id, note, off }) => {
          const stamp = stampDef(id, campaign)
          return (
            <li key={id} data-off={off}>
              <StampToken stamp={stamp} off={off} />
              <span>{stamp.label}</span>
              <small>{note}</small>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
