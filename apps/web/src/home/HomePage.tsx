import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import type { CSSProperties, ReactNode } from 'react'
import type { Campaign } from '@pixel-imperium/protocol'
import { paperStyle } from '../album/paper.ts'
import { useAccount } from '../account.ts'
import { PROVIDERS, signIn } from '../auth.ts'
import { campaignProgress, continueAt } from '../campaign/progress.ts'
import { MenuSpine, World, Worlds, morph, usePhone, useStep } from '../campaign/worlds/Worlds.tsx'
import { useLessonsDone } from '../tutorial/done.ts'
import { CampaignColumn } from './CampaignColumn.tsx'
import { type Column, type Paper, columnsFor, learnPapers, openColumn, papers, searchFor, stepColumn } from './columns.ts'
import styles from './Home.module.css'

/** Pairs a column across a morph, wide when it's open and a spine when it isn't. */
const morphName = (column: Column): CSSProperties => ({ viewTransitionName: `home-${column}` })

const paperOf = (paper: Paper) =>
  paper === 'cover' ? { index: 0, className: styles.cover } : { index: paper, className: undefined }

/**
 * Home, the main menu: one entry's column open wide, the others as spines beside it; on a phone, a carousel of
 * whole columns. Moving to another column (a spine, a swipe, ←/→, LB/RB) replaces `?open=` in the URL, so Back from
 * where a column led returns to it.
 */
export function HomePage({ campaign }: { campaign: Campaign }) {
  const { account, storage } = useAccount()
  const search = useSearch({ from: '/' })
  const navigate = useNavigate()
  const phone = usePhone()
  const done = useLessonsDone()

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

  const spineName: Record<Column, string> = {
    campaign: campaign.name.replace(/^The /, ''),
    learn: 'Learn',
    profile: 'Profile',
    settings: 'Settings',
    signin: 'Sign in',
  }

  const wide = (column: Column, start: boolean) =>
    column === 'campaign' ? (
      <CampaignColumn
        key={column}
        campaign={campaign}
        progress={progress}
        next={next}
        active={active}
        storage={storage}
        start={start}
        style={morphName(column)}
      />
    ) : (
      <PlainColumn key={column} column={column} paper={paper[column]} start={start} handle={account?.handle} />
    )

  return (
    <main className={styles.page}>
      <h1 className={styles.srOnly}>Home</h1>
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
                style={{ ...paperStyle(index), ...morphName(c) }}
              />
            )
          })}
        </Worlds>
      )}
    </main>
  )
}

/** The columns besides Campaign, for now just a heading and the way through to their pages. */
function PlainColumn({
  column,
  paper,
  start,
  handle,
}: {
  column: Exclude<Column, 'campaign'>
  paper: Paper
  start: boolean
  handle: string | undefined
}) {
  const { index, className } = paperOf(paper)
  const id = `home-${column}`
  const body: Record<typeof column, { kicker: string; name: string; content: ReactNode }> = {
    learn: {
      kicker: 'Lessons',
      name: 'Learn',
      content: (
        <Link to="/learn" data-variant="primary">
          Open Learn
        </Link>
      ),
    },
    profile: {
      kicker: 'Profile',
      name: handle ? `@${handle}` : 'Profile',
      content: handle && (
        <Link to="/u/$handle" params={{ handle }} data-variant="paper">
          Open your profile
        </Link>
      ),
    },
    settings: {
      kicker: 'Handle · Play · Sign-in',
      name: 'Settings',
      content: (
        <Link to="/settings" data-variant="primary">
          Open settings
        </Link>
      ),
    },
    signin: {
      kicker: 'Account',
      name: 'Sign in',
      content: (
        <>
          <p>Sign in to earn foil and keep your stickers on any device.</p>
          <div className={styles.providers}>
            {PROVIDERS.map(p => (
              <button
                key={p.id}
                type="button"
                data-variant="paper"
                onClick={() => void signIn.social({ provider: p.id, callbackURL: window.location.href })}
              >
                Sign in with {p.label}
              </button>
            ))}
          </div>
        </>
      ),
    },
  }
  const { kicker, name, content } = body[column]
  return (
    <World index={index} className={className} labelledBy={id} style={morphName(column)} start={start}>
      <div className={styles.plain} data-surface={paper === 'cover' ? 'cobalt' : undefined}>
        <p className={styles.kicker}>{kicker}</p>
        <h2 id={id} className={styles.hero}>
          {name}
        </h2>
        {content}
      </div>
    </World>
  )
}
