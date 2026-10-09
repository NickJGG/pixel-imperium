import type { ReactNode } from 'react'
import type { Campaign, Province } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { Lock } from '../album/Lock.tsx'
import { paperStyle } from '../album/paper.ts'
import { type CampaignProgress, isOpen } from './progress.ts'
import styles from './ProvinceIndex.module.css'

export type SlotMark = 'empty' | 'filled' | 'foil'

interface Props {
  campaign: Pick<Campaign, 'provinces'>
  progress: CampaignProgress
  /** The row's name; a link covering the whole row, or plain text to leave it unlinked. */
  name: (province: Province, open: boolean) => ReactNode
  /** Each open province's slots in order, drawn as a strip under its row. */
  slots?: (province: Province) => SlotMark[]
  /** `row` lays the provinces out as tabs side by side, the active one lit. */
  layout?: 'list' | 'row'
}

/** A cover's list of provinces, each with its tab colour and how far along it is. */
export function ProvinceIndex({ campaign, progress, name, slots, layout = 'list' }: Props) {
  return (
    <ol className={styles.index} data-layout={layout} aria-label="Provinces">
      {campaign.provinces.map((province, i) => {
        const { state, solved, total } = progress.provinces[i]!
        const open = isOpen(state)
        return (
          <li
            key={province.id}
            style={paperStyle(i)}
            data-locked={!open || undefined}
            data-active={state === 'active' || undefined}
          >
            {name(province, open)}
            {state === 'conquered' ? (
              <Dymo tone="pink" className={styles.complete}>
                Complete
              </Dymo>
            ) : open ? (
              <small>
                {solved}/{total}
              </small>
            ) : (
              <small>
                <Lock />
                Locked
              </small>
            )}
            {slots && open && (
              <span className={styles.strip} aria-hidden="true">
                {slots(province).map((mark, k) => (
                  <i key={k} data-mark={mark} />
                ))}
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
