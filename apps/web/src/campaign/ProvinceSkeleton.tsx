import { useParams } from '@tanstack/react-router'
import { type CSSProperties, type ReactNode, useRef } from 'react'
import type { Province, Tier } from '@pixel-imperium/protocol'
import { getAccount } from '../account.ts'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { currentCampaign } from './last-campaign.ts'
import { type ProvinceState, campaignProgress, isOpen, tierGroups } from './progress.ts'
import { ROWS, TIER_NAME } from './ProvincePage.tsx'
import { useAnnounceSkeleton } from './worlds/morph-nav.ts'
import { Backdrop, SkeletonSpine, World, Worlds, morphName, usePhone, useSpineReach } from './worlds/Worlds.tsx'
import styles from './Province.module.css'
import campaignStyles from './Campaign.module.css'

/** A province's shelves when there's no campaign in memory to count them. */
const SHELVES: { tier: Tier; count: number }[] = [
  { tier: 'easy', count: 12 },
  { tier: 'medium', count: 16 },
  { tier: 'hard', count: 2 },
]

/**
 * A province's page while it loads: its column with the shelves it will have, the other provinces as spines, or on
 * a phone a carousel with its fogged neighbours peeking. Without its campaign in memory, the whole page is in the fog.
 * Its column and spines pair with the page it's leaving, so a morph can play into it.
 */
export function ProvinceSkeleton() {
  const { campaignId, provinceId } = useParams({ from: '/c/$campaignId/$provinceId' })
  const phone = usePhone()
  const cached = currentCampaign()
  const campaign = cached?.id === campaignId ? cached : null
  const index = campaign?.provinces.findIndex(p => p.id === provinceId) ?? -1
  const province = campaign?.provinces[index]
  const states = campaign && campaignProgress(campaign, getAccount().storage).provinces.map(p => p.state)

  const column = (
    <Column key="page" id={provinceId} index={Math.max(index, 0)} province={province} state={states?.[index]} />
  )
  if (!campaign || !province) {
    return (
      <Page index={0}>
        {phone ? (
          <Worlds carousel>
            <World index={0} fog />
            {column}
            <World index={0} fog />
          </Worlds>
        ) : (
          <Worlds>{column}</Worlds>
        )}
      </Page>
    )
  }
  return (
    <Page index={index}>
      <Worlds carousel={phone}>
        {campaign.provinces.map((p, i) => {
          if (p === province) return column
          if (phone) return <World key={p.id} index={i} fog />
          const state = states![i]!
          return (
            <SkeletonSpine
              key={p.id}
              paper={i}
              state={state}
              thin
              pairs="province"
              style={morphName(p)}
              name={<Bar w={18} h={110} />}
            >
              {isOpen(state) && <Bar w={44} h={22} pill />}
            </SkeletonSpine>
          )
        })}
      </Worlds>
    </Page>
  )
}

/** `index` is the page column's paper, for the backdrop the Home morph plays over. */
function Page({ index, children }: { index: number; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)
  useAnnounceSkeleton()
  return (
    <main ref={ref} className={styles.page} aria-busy="true">
      <SrLoading />
      <Backdrop index={index} />
      {children}
    </main>
  )
}

function Column({
  id,
  index,
  province,
  state,
}: {
  /** The province's id, from the URL. */
  id: string
  index: number
  province: Province | undefined
  state: ProvinceState | undefined
}) {
  const shelves = province ? tierGroups(province).map(g => ({ tier: g.tier, count: g.slots.length })) : SHELVES
  const columns = shelves.map(s => Math.ceil(s.count / ROWS))
  return (
    <World index={index} fog={!state || !isOpen(state)} style={morphName({ id })} start pair>
      <div className={styles.zoom}>
        <header className={styles.head}>
          <div className={styles.title}>
            <Bar w="min(240px, 60%)" h={14} />
            <Bar w="min(420px, 80%)" h={52} style={{ marginTop: 'var(--space-1)' }} />
          </div>
          <Bar w={96} h={30} pill />
        </header>
        <div
          className={styles.shelves}
          style={{ '--shelves': columns.map(n => `minmax(0, ${n}fr)`).join(' ') } as CSSProperties}
        >
          {shelves.map(({ tier, count }, g) => (
            <section key={tier} className={styles.shelf}>
              <h2 className={styles.tier}>
                {TIER_NAME[tier]}
                <Bar w={34} h={12} />
              </h2>
              <ol className={styles.slots} style={{ '--cols': columns[g], '--rows': ROWS } as CSSProperties}>
                {Array.from({ length: count }, (_, i) => (
                  <li key={i}>
                    <Ghost style={{ width: '100%', aspectRatio: 1 }} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        {state !== 'conquered' && (
          <footer className={styles.foot}>
            <div className={campaignStyles.nextUp}>
              <Ghost style={{ width: 64, height: 64 }} />
              <div className={campaignStyles.nextText}>
                <p className={campaignStyles.nextLabel}>Next up</p>
                <Bar w={150} h={18} />
                <Bar w={60} h={14} style={{ marginTop: 2 }} />
              </div>
              <Bar w={140} h={44} pill />
            </div>
          </footer>
        )}
      </div>
    </World>
  )
}
