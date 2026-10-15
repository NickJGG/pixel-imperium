import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import { type ReactNode, useMemo, useRef, useState } from 'react'
import type { Campaign, Paper } from '@pixel-imperium/protocol'
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
import {
  DraftCampaignColumn,
  NewCampaignColumn,
  OwnCampaignColumn,
  PlayedByLinkColumn,
  PlayedCampaignColumn,
  PuzzlesColumn,
} from './Columns.tsx'
import {
  PUZZLES,
  type Workshop,
  type WorkshopSearch,
  type WorkshopTab,
  mergeDrafts,
  playedCampaigns,
  titleOf,
  yourCampaigns,
  yourPuzzles,
} from './workshop.ts'
import homeStyles from '../home/Home.module.css'
import styles from './Workshop.module.css'

const route = getRouteApi('/workshop')

interface Column {
  key: string
  name: string
  paper: Paper
  render: (start: boolean) => ReactNode
}

const searchOf = (tab: WorkshopTab, key: string): WorkshopSearch => ({
  ...(tab === 'played' && { tab }),
  ...(key !== PUZZLES && { open: key }),
})

/**
 * The Workshop: under Yours, a Puzzles column then the Author's campaigns, published and draft, with a dashed spine
 * to start another; under Played, the puzzles opened by link then the campaigns played. Drawn like Campaigns, one
 * column open and the rest as spines, a carousel on a phone; moving along replaces `?open=` in the URL.
 */
export function WorkshopPage({ workshop, campaign }: { workshop: Workshop; campaign: Campaign | null }) {
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

  const columns: Column[] =
    tab === 'yours'
      ? [
          {
            key: PUZZLES,
            name: 'Puzzles',
            paper: 'workshop',
            render: start => <PuzzlesColumn key={PUZZLES} entries={entries} start={start} />,
          },
          ...yourCampaigns(workshop).map((e): Column =>
            e.kind === 'published'
              ? {
                  key: e.campaign.id,
                  name: e.campaign.title,
                  paper: e.campaign.paper,
                  render: start => (
                    <OwnCampaignColumn
                      key={e.campaign.id}
                      campaign={e.campaign}
                      puzzles={workshop.made.puzzles}
                      start={start}
                    />
                  ),
                }
              : {
                  key: e.campaign.id,
                  name: `${titleOf(e.campaign.title)} · draft`,
                  paper: 'workshop',
                  render: start => <DraftCampaignColumn key={e.campaign.id} campaign={e.campaign} start={start} />,
                },
          ),
        ]
      : [
          {
            key: PUZZLES,
            name: 'Played by link',
            paper: 'workshop',
            render: start => (
              <PlayedByLinkColumn key={PUZZLES} puzzles={workshop.played.puzzles} storage={storage} start={start} />
            ),
          },
          ...playedCampaigns(workshop.played).map(
            (c): Column => ({
              key: c.id,
              name: c.title,
              paper: c.paper,
              render: start => (
                <PlayedCampaignColumn
                  key={c.id}
                  summary={c}
                  campaign={campaign?.id === c.id ? campaign : null}
                  storage={storage}
                  start={start}
                />
              ),
            }),
          ),
        ]
  const NEW = 'new'
  if (phone && tab === 'yours') {
    columns.push({
      key: NEW,
      name: 'New campaign',
      paper: 'workshop',
      render: start => <NewCampaignColumn key={NEW} start={start} />,
    })
  }
  const at = Math.max(0, columns.findIndex(c => c.key === (search.open ?? PUZZLES)))

  const goTo = (i: number) => {
    const to = columns[i]
    if (!to || i === at || to.key === NEW) return
    void navigate({ to: '/workshop', search: searchOf(tab, to.key), replace: true })
  }
  useStep(dir => goTo(at + dir))
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)

  const tabs = (
    <nav className={`${styles.tabs} ${styles.seg}`} aria-label="Whose">
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

  if (phone) {
    return (
      <main ref={ref} className={styles.page}>
        <h1 className={homeStyles.srOnly}>Workshop</h1>
        <Backdrop paper={columns[at]!.paper} />
        {tabs}
        <Worlds carousel onSnap={goTo}>
          {columns.map((c, i) => c.render(i === at))}
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
            c.render(true)
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
