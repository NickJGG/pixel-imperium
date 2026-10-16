import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import type { Campaign } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { jump, windowOf } from '../campaign/campaigns.ts'
import {
  Backdrop,
  NewCampaignSpine,
  WorkshopSpine,
  WorkshopStub,
  Worlds,
  usePhone,
  useSpineReach,
  useStep,
} from '../campaign/worlds/Worlds.tsx'
import { localDrafts } from '../make/draft-store.ts'
import { sticker } from '../Trail.tsx'
import type { StoredCampaign } from './campaign-store.ts'
import {
  NewCampaignColumn,
  OwnCampaignColumn,
  PlayedByLinkColumn,
  PlayedCampaignColumn,
  PuzzlesColumn,
} from './Columns.tsx'
import { DraftCampaignColumn } from './DraftCover.tsx'
import {
  PUZZLES,
  type RowColumn,
  type Workshop,
  type WorkshopSearch,
  type WorkshopTab,
  mergeDrafts,
  openIndex,
  workshopRow,
  yourPuzzles,
} from './workshop.ts'
import homeStyles from '../home/Home.module.css'
import styles from './Workshop.module.css'

const route = getRouteApi('/workshop')

const searchOf = (tab: WorkshopTab, key: string): WorkshopSearch => ({
  ...(tab === 'played' && { tab }),
  ...(key !== PUZZLES && { open: key }),
})

/**
 * The Workshop: under Yours, a Puzzles column then the Author's campaigns, published and draft, with a dashed spine
 * to start another; under Played, the puzzles opened by link then the campaigns played. Drawn like Campaigns, one
 * column open and the rest as spines, a carousel on a phone; moving along replaces `?open=` in the URL.
 */
export function WorkshopPage({
  workshop,
  campaign,
  draft,
}: {
  workshop: Workshop
  /** The Played campaign open, loaded for its column. */
  campaign: Campaign | null
  /** The draft campaign open, loaded for its cover. */
  draft: StoredCampaign | null
}) {
  const { account, storage } = useAccount()
  const search = route.useSearch()
  const navigate = useNavigate()
  const phone = usePhone()
  const tab: WorkshopTab = search.tab ?? 'yours'
  const [local] = useState(() => localDrafts(account?.userId ?? ''))
  const entries = useMemo(
    () => yourPuzzles(mergeDrafts(workshop.drafts.puzzles, local), workshop.made),
    [workshop, local],
  )

  const columns = workshopRow(workshop, tab, { phone })
  const at = openIndex(columns, search.open)
  const render = (c: RowColumn, start: boolean): ReactNode => {
    switch (c.kind) {
      case 'puzzles':
        return tab === 'yours' ? (
          <PuzzlesColumn key={c.key} entries={entries} start={start} />
        ) : (
          <PlayedByLinkColumn key={c.key} puzzles={workshop.played.puzzles} storage={storage} start={start} />
        )
      case 'published':
        return <OwnCampaignColumn key={c.key} campaign={c.campaign} puzzles={workshop.made.puzzles} start={start} />
      case 'draft':
        return (
          <DraftCampaignColumn
            key={c.key}
            summary={c.campaign}
            draftKey={{ userId: account!.userId, id: c.key }}
            opening={search.open === c.key ? draft : null}
            start={start}
          />
        )
      case 'played':
        return (
          <PlayedCampaignColumn
            key={c.key}
            summary={c.campaign}
            campaign={campaign?.id === c.key ? campaign : null}
            storage={storage}
            start={start}
          />
        )
      case 'new':
        return <NewCampaignColumn key={c.key} start={start} />
    }
  }

  const goTo = (i: number) => {
    const to = columns[i]
    if (!to || i === at || to.kind === 'new') return
    void navigate({ to: '/workshop', search: searchOf(tab, to.key), replace: true })
  }
  useStep(dir => goTo(at + dir))
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)

  const tabs = <WorkshopTabs tab={tab} />

  if (phone) {
    return (
      <main ref={ref} className={styles.page}>
        <h1 className={homeStyles.srOnly}>Workshop</h1>
        <Backdrop paper={columns[at]!.paper} />
        {tabs}
        <Worlds carousel onSnap={goTo}>
          {columns.map((c, i) => render(c, i === at))}
        </Worlds>
      </main>
    )
  }
  const { lo, hi } = windowOf(columns.length, at)
  return (
    <main ref={ref} className={styles.page}>
      <h1 className={homeStyles.srOnly}>Workshop</h1>
      <Backdrop paper={columns[at]!.paper} />
      {tabs}
      <Worlds>
        {lo > 0 && (
          <WorkshopStub search={searchOf(tab, columns[jump(at, -1, columns.length)]!.key)} hidden={lo} side="before" />
        )}
        {columns.slice(lo, hi).map((c, i) =>
          lo + i === at ? (
            render(c, true)
          ) : (
            <WorkshopSpine
              key={c.key}
              name={c.name}
              paper={c.paper}
              search={searchOf(tab, c.key)}
              morph={c.key}
              before={lo + i < at}
            />
          ),
        )}
        {hi < columns.length && (
          <WorkshopStub
            search={searchOf(tab, columns[jump(at, 1, columns.length)]!.key)}
            hidden={columns.length - hi}
            side="after"
          />
        )}
        {tab === 'yours' && <NewCampaignSpine />}
      </Worlds>
    </main>
  )
}

/** Yours and Played; `inert` stands it in a skeleton. */
export function WorkshopTabs({ tab, inert = false }: { tab: WorkshopTab; inert?: boolean }) {
  return (
    <nav className={`${styles.tabs} ${styles.tabsPill}`} style={sticker('workshop-tabs', 2)} aria-label="Whose" inert={inert}>
      <Link
        to="/workshop"
        search={{}}
        replace
        data-variant="flat"
        data-size="compact"
        aria-current={tab === 'yours' ? 'page' : undefined}
      >
        Yours
      </Link>
      <Link
        to="/workshop"
        search={{ tab: 'played' }}
        replace
        data-variant="flat"
        data-size="compact"
        aria-current={tab === 'played' ? 'page' : undefined}
      >
        Played
      </Link>
    </nav>
  )
}
