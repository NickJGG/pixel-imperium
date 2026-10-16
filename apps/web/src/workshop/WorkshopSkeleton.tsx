import { useSearch } from '@tanstack/react-router'
import { type ReactNode, useRef } from 'react'
import { getAccount } from '../account.ts'
import { windowOf } from '../campaign/campaigns.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import {
  Backdrop,
  SkeletonCampaignStub,
  SkeletonNewCampaignSpine,
  SkeletonSpine,
  World,
  Worlds,
  usePhone,
  useSpineReach,
  workshopMorphName,
} from '../campaign/worlds/Worlds.tsx'
import { currentWorkshop } from '../content.ts'
import { localDrafts } from '../make/draft-store.ts'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { type RowColumn, PUZZLES, type WorkshopTab, mergeDrafts, openIndex, workshopRow, yourPuzzles } from './workshop.ts'
import { WorkshopTabs } from './WorkshopPage.tsx'
import home from '../home/Home.module.css'
import styles from './Workshop.module.css'

/**
 * The Workshop while it loads: the open column and the window of spines around it, from the Workshop last loaded,
 * or a carousel on a phone. Without one, the open column stands alone, in the fog unless it leads its tab.
 * Its columns and spines pair with the page it's leaving, so a morph can play into it.
 */
export function WorkshopSkeleton() {
  const search = useSearch({ from: '/workshop' })
  const tab: WorkshopTab = search.tab ?? 'yours'
  const phone = usePhone()
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)
  useAnnounceSkeleton()
  const userId = getAccount().account?.userId
  const workshop = currentWorkshop(userId)
  const row = workshop && workshopRow(workshop, tab, { phone })
  const at = row ? openIndex(row, search.open) : -1
  const key = search.open ?? PUZZLES
  const known = row?.[at]
  const shelf =
    workshop && known?.kind === 'puzzles' && tab === 'yours'
      ? yourPuzzles(mergeDrafts(workshop.drafts.puzzles, localDrafts(userId ?? '')), workshop.made).length
      : workshop && known?.kind === 'published'
        ? workshop.made.puzzles.filter(p => p.campaignId === known.key).length
        : 0
  const paper = known?.paper ?? 'workshop'

  const open = (
    <World key={known?.key ?? key} paper={paper} fog={!known && key !== PUZZLES} style={workshopMorphName(known?.key ?? key)} start pair>
      <OpenStack column={known ?? (key === PUZZLES ? { kind: 'puzzles' } : undefined)} tab={tab} shelf={Math.min(shelf, 15)} />
    </World>
  )
  const page = (body: ReactNode) => (
    <main ref={ref} className={styles.page} aria-busy="true">
      <SrLoading />
      <Backdrop paper={paper} />
      <WorkshopTabs tab={tab} inert />
      {body}
    </main>
  )

  if (!row) return page(<Worlds>{open}</Worlds>)
  if (phone) {
    return page(
      <Worlds carousel>{row.map((c, i) => (i === at ? open : <World key={c.key} paper={c.paper} fog />))}</Worlds>,
    )
  }
  const { lo, hi } = windowOf(row.length, at)
  return page(
    <Worlds>
      {lo > 0 && <SkeletonCampaignStub hidden={lo} side="before" />}
      {row.slice(lo, hi).map((c, i) =>
        lo + i === at ? (
          open
        ) : (
          <SkeletonSpine
            key={c.key}
            paper={c.paper}
            state="active"
            pairs="campaign"
            before={lo + i < at}
            style={workshopMorphName(c.key)}
            name={c.name}
          />
        ),
      )}
      {hi < row.length && <SkeletonCampaignStub hidden={row.length - hi} side="after" />}
      {tab === 'yours' && <SkeletonNewCampaignSpine />}
    </Worlds>,
  )
}

/** The open column: a lead column's own heading, anything else's as bars; `shelf` ghosts where its puzzles go. */
function OpenStack({ column, tab, shelf }: { column: Pick<RowColumn, 'kind'> | undefined; tab: WorkshopTab; shelf: number }) {
  const lead = column?.kind === 'puzzles'
  return (
    <div className={home.column}>
      <div className={home.stack}>
        {lead ? (
          <>
            <p className={home.kicker}>{tab === 'yours' ? 'Your puzzles' : 'Player-made puzzles'}</p>
            <h2 className={home.hero}>{tab === 'yours' ? 'Puzzles' : 'Played by link'}</h2>
          </>
        ) : (
          <>
            <Bar w="60%" h={14} />
            <Bar w="80%" h={52} />
          </>
        )}
        <Bar w={104} h={30} pill />
        <Bar w="70%" h={16} />
        <div className={home.actions}>
          <Bar w="100%" h={52} pill />
          <Bar w="100%" h={52} pill />
        </div>
      </div>
      {shelf > 0 && (
        <div className={home.picture}>
          <div className={styles.shelfWrap}>
            <ul className={styles.shelf}>
              {Array.from({ length: shelf }, (_, i) => (
                <li key={i}>
                  <Ghost style={{ width: '100%', aspectRatio: 1 }} />
                  <Bar w="70%" h={12} style={{ margin: 'var(--space-1) auto 0' }} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
