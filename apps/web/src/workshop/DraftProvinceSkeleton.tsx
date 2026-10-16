import { useParams } from '@tanstack/react-router'
import { type CSSProperties, type ReactNode, useRef } from 'react'
import type { Paper, Province } from '@pixel-imperium/protocol'
import { getAccount } from '../account.ts'
import { TIER_NAME } from '../campaign/ProvincePage.tsx'
import { type ProvinceState, isOpen, provinceStates, shelfLayout, tierGroups } from '../campaign/progress.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import {
  Backdrop,
  SkeletonAddProvinceSpine,
  SkeletonSpine,
  World,
  Worlds,
  draftProvinceMorph,
  usePhone,
  useSpineReach,
} from '../campaign/worlds/Worlds.tsx'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { useHudTrail } from '../Trail.tsx'
import { draftTrail } from './BuilderPage.tsx'
import { MAX_PROVINCES, MAX_PROVINCE_PUZZLES, TIERED_FROM, draftAsCampaign } from './campaign-draft.ts'
import { peekCampaign } from './campaign-store.ts'
import { playtestSolved } from './CampaignPlaytest.tsx'
import { titleOf } from './workshop.ts'
import provinceStyles from '../campaign/Province.module.css'

/**
 * A draft campaign's province in its builder or its playtest while it loads, drawn from this device's copy of the
 * draft: its column with the shelves it will have, the other provinces as spines, or a carousel on a phone. Without
 * a copy here, its column stands alone in the fog. Its column and spines pair with the page it's leaving.
 */
export function DraftProvinceSkeleton({ playtest = false }: { playtest?: boolean }) {
  const { id = '', n } = useParams({ strict: false })
  const phone = usePhone()
  const userId = getAccount().account?.userId
  const stored = userId === undefined ? null : peekCampaign({ userId, id })
  const campaign = stored && draftAsCampaign(id, stored.doc, stored.preview, new Map())
  const provinces = campaign?.provinces ?? []
  const k = Math.min(Math.max(0, (Number(n) || 1) - 1), Math.max(0, provinces.length - 1))
  const province = provinces[k]
  const states = campaign && (playtest ? provinceStates(campaign, playtestSolved(id)).provinces.map(p => p.state) : null)
  useHudTrail(stored ? draftTrail(id, stored.doc) : [])

  const column = (
    <Column
      key="page"
      k={k}
      province={province}
      state={states?.[k]}
      playtest={playtest}
      title={stored && titleOf(stored.doc.title)}
      fog={!province}
    />
  )
  if (!campaign || !province) {
    return (
      <Page paper={campaign?.paper ?? 'workshop'}>
        <Worlds>{column}</Worlds>
      </Page>
    )
  }
  return (
    <Page paper={province.paper}>
      <Worlds carousel={phone}>
        {provinces.map((p, j) => {
          if (j === k) return column
          if (phone) return <World key={p.id} paper={p.paper} fog />
          const state = states?.[j] ?? 'active'
          return (
            <SkeletonSpine
              key={p.id}
              paper={p.paper}
              state={state}
              thin
              pairs="province"
              style={draftProvinceMorph(j + 1)}
              name={p.name}
            >
              {isOpen(state) && <Bar w={44} h={22} pill />}
            </SkeletonSpine>
          )
        })}
        {!playtest && !phone && provinces.length < MAX_PROVINCES && <SkeletonAddProvinceSpine />}
      </Worlds>
    </Page>
  )
}

/** `paper` is the page column's, for the backdrop the morph plays over. */
function Page({ paper, children }: { paper: Paper; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)
  useAnnounceSkeleton()
  return (
    <main ref={ref} className={provinceStyles.page} aria-busy="true">
      <SrLoading />
      <Backdrop paper={paper} />
      {children}
    </main>
  )
}

function Column({
  k,
  province,
  state,
  playtest,
  title,
  fog,
}: {
  k: number
  province: Province | undefined
  /** In a playtest, where provinces unlock. */
  state: ProvinceState | undefined
  playtest: boolean
  title: string | null
  fog: boolean
}) {
  const tiered = province?.puzzles.some(p => p.tier) ?? false
  const count = province?.puzzles.length ?? 0
  const groups = tiered
    ? tierGroups(province!).map(g => ({ tier: g.tier, count: g.slots.length }))
    : [{ tier: null, count: province ? count : 6 }]
  // The builder's dashed + slot, while there's room in an untiered province.
  const plus = !playtest && !tiered && count < TIERED_FROM && count < MAX_PROVINCE_PUZZLES ? 1 : 0
  const sizes = groups.map((g, i) => g.count + (i === groups.length - 1 ? plus : 0))
  const { rows, columns } = shelfLayout(sizes)
  const locked = state !== undefined && !isOpen(state)
  return (
    <World
      paper={province?.paper ?? 'workshop'}
      fog={fog || locked}
      style={draftProvinceMorph(k + 1)}
      start
      pair={!locked}
    >
      <div className={provinceStyles.zoom}>
        <header className={provinceStyles.head}>
          <div className={provinceStyles.title}>
            {playtest && title === null ? (
              <Bar w="min(240px, 60%)" h={14} />
            ) : (
              <p className={provinceStyles.kicker}>
                {playtest ? `Playtest · ${title} · Province ${k + 1}` : `Province ${k + 1}`}
              </p>
            )}
            <Bar w="min(420px, 80%)" h={52} style={{ marginTop: 'var(--space-1)' }} />
          </div>
          <Bar w={96} h={30} pill />
        </header>
        <div
          className={provinceStyles.shelves}
          style={{ '--shelves': columns.map(c => `minmax(0, ${c}fr)`).join(' ') } as CSSProperties}
        >
          {groups.map(({ tier }, g) => (
            <section key={tier ?? 'all'} className={provinceStyles.shelf}>
              <h2 className={provinceStyles.tier}>
                {tier ? TIER_NAME[tier] : 'Puzzles'}
                <Bar w={34} h={12} />
              </h2>
              <ol className={provinceStyles.slots} style={{ '--cols': columns[g], '--rows': rows } as CSSProperties}>
                {Array.from({ length: sizes[g]! }, (_, i) => (
                  <li key={i}>
                    <Ghost style={{ width: '100%', aspectRatio: 1 }} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <footer className={provinceStyles.foot}>
          <Bar w={140} h={44} pill />
          <Bar w={140} h={44} pill />
        </footer>
      </div>
    </World>
  )
}
