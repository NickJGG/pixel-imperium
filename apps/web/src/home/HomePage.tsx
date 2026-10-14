import { useNavigate, useSearch } from '@tanstack/react-router'
import { type CSSProperties, useRef } from 'react'
import type { Campaign, DailyYear, Profile } from '@pixel-imperium/protocol'
import { type PaperId, paperFor, seasonOf } from '../album/paper.ts'
import { useAccount } from '../account.ts'
import { isFeatured } from '../campaign/campaigns.ts'
import { useStartedCampaigns } from '../campaign/started-campaigns.ts'
import { Backdrop, MenuSpine, Worlds, usePhone, useSpineReach, useStep } from '../campaign/worlds/Worlds.tsx'
import { useLessonsDone } from '../tutorial/done.ts'
import { dayKey } from '../profile/activity.ts'
import { CampaignColumn } from './CampaignColumn.tsx'
import { DailyColumn } from './DailyColumn.tsx'
import { LearnColumn } from './LearnColumn.tsx'
import { ProfileColumn } from './ProfileColumn.tsx'
import { SettingsColumn } from './SettingsColumn.tsx'
import { SignInColumn } from './SignInColumn.tsx'
import { COLUMN_NAME, type Column, type Paper, columnsFor, learnPapers, openColumn, papers, searchFor, stepColumn } from './columns.ts'
import styles from './Home.module.css'

/** Pairs a column across a morph, wide when it's open and a spine when it isn't. */
export const columnName = (column: Column): CSSProperties => ({ viewTransitionName: `home-${column}` })

export const paperOf = (paper: Paper): { paper: PaperId; className: string | undefined } =>
  paper === 'cover' ? { paper: 'marches', className: styles.cover } : { paper, className: undefined }

/** Home's backdrop: the open column's paper where it has one of its own, else the campaign's. */
export const backdropPaper = (open: Column, paper: Record<Column, Paper>): PaperId =>
  paperOf(paper[open === 'daily' || open === 'learn' || open === 'featured' ? open : 'campaign']).paper

/**
 * Home, the main menu: one entry's column open wide, the others as spines beside it; on a phone, a carousel of
 * whole columns. Moving to another column (a spine, a swipe, ←/→, LB/RB) replaces `?open=` in the URL, so Back from
 * where a column led returns to it.
 */
export function HomePage({
  campaign,
  featured,
  profile,
  dailyYear,
}: {
  campaign: Campaign
  /** The newest Featured campaign, if there is one this device hasn't started. */
  featured: Campaign | null
  profile: Profile | null
  /** This Year's Dailies, `null` before launch. */
  dailyYear: DailyYear | null
}) {
  const { account, storage } = useAccount()
  const search = useSearch({ from: '/' })
  const navigate = useNavigate()
  const phone = usePhone()
  const done = useLessonsDone()

  /** The loader's profile, while it's still the signed-in player's. */
  const own = account && profile?.handle.toLowerCase() === account.handle.toLowerCase() ? profile : null

  const today = dayKey(new Date())
  const daily = dailyYear && today >= dailyYear.launch ? dailyYear : null
  const started = useStartedCampaigns(storage, own?.campaigns.map(c => c.id))
  const showcase =
    featured && featured.id !== campaign.id && !started.has(featured.id) && isFeatured(featured, today) ? featured : null
  const columns = columnsFor(account !== null, daily !== null, showcase !== null)
  const open = openColumn(columns, search)
  const season = seasonOf(Number(today.slice(5, 7)))
  const paper = papers(campaign.paper, learnPapers(done), season, showcase?.paper)

  const goTo = (column: Column | undefined) => {
    if (!column || column === open) return
    void navigate({ to: '/', search: searchFor(column), replace: true })
  }
  useStep(dir => goTo(stepColumn(columns, open, dir)))
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)

  const wide = (column: Column, start: boolean) => {
    const { paper: worn, className } = paperOf(paper[column])
    const common = { start, style: columnName(column) }
    switch (column) {
      case 'campaign':
        return <CampaignColumn key={column} {...common} campaign={campaign} storage={storage} />
      case 'featured':
        return showcase && <CampaignColumn key={column} {...common} campaign={showcase} storage={storage} featured />
      case 'daily':
        return (
          daily && (
            <DailyColumn
              key={column}
              {...common}
              data={daily}
              profile={own}
              storage={storage}
              season={season}
            />
          )
        )
      case 'learn':
        return <LearnColumn key={column} {...common} done={done} paper={worn} />
      case 'profile':
        return (
          account && (
            <ProfileColumn
              key={column}
              {...common}
              handle={account.handle}
              profile={own}
              campaign={campaign}
              dailyYear={daily}
              storage={storage}
              className={className}
            />
          )
        )
      case 'settings':
        return account && <SettingsColumn key={column} {...common} handle={account.handle} joinedAt={own?.joinedAt} paper={worn} />
      case 'signin':
        return <SignInColumn key={column} {...common} paper={worn} />
    }
  }

  return (
    <main ref={ref} className={styles.page}>
      <h1 className={styles.srOnly}>Home</h1>
      <Backdrop paper={backdropPaper(open, paper)} />
      {phone ? (
        <Worlds carousel onSnap={i => goTo(columns[i])}>
          {columns.map(c => wide(c, c === open))}
        </Worlds>
      ) : (
        <Worlds>
          {columns.map(c => {
            if (c === open) return wide(c, true)
            const { paper: worn, className } = paperOf(paper[c])
            return (
              <MenuSpine
                key={c}
                name={c === 'featured' ? showcase!.name.replace(/^The /, '') : COLUMN_NAME[c]}
                search={searchFor(c)}
                before={columns.indexOf(c) < columns.indexOf(open)}
                featured={c === 'featured'}
                className={className}
                style={{ ...paperFor(worn), ...columnName(c) }}
              />
            )
          })}
        </Worlds>
      )}
    </main>
  )
}
