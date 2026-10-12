import { useNavigate, useSearch } from '@tanstack/react-router'
import type { CSSProperties } from 'react'
import type { Campaign, Profile } from '@pixel-imperium/protocol'
import { paperStyle } from '../album/paper.ts'
import { useAccount } from '../account.ts'
import { campaignProgress, continueAt } from '../campaign/progress.ts'
import { Backdrop, MenuSpine, Worlds, morph, usePhone, useStep } from '../campaign/worlds/Worlds.tsx'
import { useLessonsDone } from '../tutorial/done.ts'
import { CampaignColumn } from './CampaignColumn.tsx'
import { LearnColumn } from './LearnColumn.tsx'
import { ProfileColumn } from './ProfileColumn.tsx'
import { SettingsColumn } from './SettingsColumn.tsx'
import { SignInColumn } from './SignInColumn.tsx'
import { COLUMN_NAME, type Column, type Paper, columnsFor, learnPapers, openColumn, papers, searchFor, stepColumn } from './columns.ts'
import styles from './Home.module.css'

/** Pairs a column across a morph, wide when it's open and a spine when it isn't. */
const columnName = (column: Column): CSSProperties => ({ viewTransitionName: `home-${column}` })

export const paperOf = (paper: Paper) =>
  paper === 'cover' ? { index: 0, className: styles.cover } : { index: paper, className: undefined }

/**
 * Home, the main menu: one entry's column open wide, the others as spines beside it; on a phone, a carousel of
 * whole columns. Moving to another column (a spine, a swipe, ←/→, LB/RB) replaces `?open=` in the URL, so Back from
 * where a column led returns to it.
 */
export function HomePage({ campaign, profile }: { campaign: Campaign; profile: Profile | null }) {
  const { account, storage } = useAccount()
  const search = useSearch({ from: '/' })
  const navigate = useNavigate()
  const phone = usePhone()
  const done = useLessonsDone()

  /** The loader's profile, while it's still the signed-in player's. */
  const own = account && profile?.handle.toLowerCase() === account.handle.toLowerCase() ? profile : null

  const columns = columnsFor(account !== null)
  const open = openColumn(columns, search)
  const progress = campaignProgress(campaign, storage)
  const next = continueAt(campaign, progress, id => storage.loadSolved(id) !== null)
  const active = next ? campaign.provinces.indexOf(next.province) : campaign.provinces.length - 1
  const paper = papers(active, learnPapers(done))

  const goTo = (column: Column | undefined, viewTransition: boolean) => {
    if (!column || column === open) return
    void navigate({ to: '/', search: searchFor(column), replace: true, viewTransition })
  }
  useStep(dir => goTo(stepColumn(columns, open, dir), morph()))

  const spineName: Record<Column, string> = { campaign: campaign.name.replace(/^The /, ''), ...COLUMN_NAME }

  const wide = (column: Column, start: boolean) => {
    const { index, className } = paperOf(paper[column])
    const common = { start, style: columnName(column) }
    switch (column) {
      case 'campaign':
        return (
          <CampaignColumn key={column} {...common} campaign={campaign} progress={progress} next={next} active={active} storage={storage} />
        )
      case 'learn':
        return <LearnColumn key={column} {...common} done={done} index={index} />
      case 'profile':
        return (
          account && (
            <ProfileColumn
              key={column}
              {...common}
              handle={account.handle}
              profile={own}
              campaign={campaign}
              storage={storage}
              className={className}
            />
          )
        )
      case 'settings':
        return account && <SettingsColumn key={column} {...common} handle={account.handle} joinedAt={own?.joinedAt} index={index} />
      case 'signin':
        return <SignInColumn key={column} {...common} index={index} />
    }
  }

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Home</h1>
      <Backdrop index={active} />
      {phone ? (
        <Worlds carousel onSnap={i => goTo(columns[i], false)}>
          {columns.map(c => wide(c, c === open))}
        </Worlds>
      ) : (
        <Worlds>
          {columns.map(c => {
            if (c === open) return wide(c, true)
            const { index, className } = paperOf(paper[c])
            return (
              <MenuSpine
                key={c}
                name={spineName[c]}
                search={searchFor(c)}
                className={className}
                style={{ ...paperStyle(index), ...columnName(c) }}
              />
            )
          })}
        </Worlds>
      )}
    </main>
  )
}
