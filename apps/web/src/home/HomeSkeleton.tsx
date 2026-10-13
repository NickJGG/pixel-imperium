import { useSearch } from '@tanstack/react-router'
import type { Campaign } from '@pixel-imperium/protocol'
import { seasonOf } from '../album/paper.ts'
import { getAccount, likelySignedIn } from '../account.ts'
import { currentCampaign } from '../campaign/last-campaign.ts'
import { campaignProgress, continueAt } from '../campaign/progress.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import { Backdrop, SkeletonSpine, World, Worlds, usePhone } from '../campaign/worlds/Worlds.tsx'
import { MonthGridSkeleton } from '../daily/MonthCalendar.tsx'
import { datesOf, leadOf } from '../daily/month.ts'
import { currentDailyYear } from '../daily/year.ts'
import { dayKey } from '../profile/activity.ts'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { useLessonsDone } from '../tutorial/done.ts'
import { COLUMN_NAME, type Column, columnsFor, learnPapers, openColumn, papers } from './columns.ts'
import { columnName, paperOf } from './HomePage.tsx'
import styles from './Home.module.css'

/** The province Home's Campaign column wears, as `HomePage` works it out. */
function activeProvince(campaign: Campaign): number {
  const { storage } = getAccount()
  const next = continueAt(campaign, campaignProgress(campaign, storage), id => storage.loadSolved(id) !== null)
  return next ? campaign.provinces.indexOf(next.province) : campaign.provinces.length - 1
}

/**
 * Home while it loads: the open column wide and the rest as spines, or a carousel on a phone. The columns guess the
 * account from the last one this device saw, and the Daily column's launch from the Year last loaded; without a
 * campaign in memory, the Campaign column is in the fog.
 * Its columns pair with Home's own, so a morph can play into it.
 */
export function HomeSkeleton() {
  const search = useSearch({ from: '/' })
  const phone = usePhone()
  const done = useLessonsDone()
  const campaign = currentCampaign()
  const today = dayKey(new Date())
  const launch = currentDailyYear()?.launch
  const columns = columnsFor(likelySignedIn(), launch === undefined || today >= launch)
  const open = openColumn(columns, search)
  const active = campaign ? activeProvince(campaign) : 0
  const season = seasonOf(Number(today.slice(5, 7)))
  const paper = papers(active, learnPapers(done), season)
  useAnnounceSkeleton()

  const wide = (column: Column, start: boolean) => {
    const { index, className } = paperOf(paper[column])
    return (
      <World
        key={column}
        index={index}
        fog={column === 'campaign' && !campaign}
        className={className}
        style={columnName(column)}
        start={start}
        pair={column === 'campaign' || column === 'daily' || column === 'learn'}
      >
        {column === 'campaign' ? (
          <CampaignStack campaign={campaign} />
        ) : column === 'daily' ? (
          <DailyStack today={today} />
        ) : (
          <ColumnStack />
        )}
      </World>
    )
  }

  return (
    <main className={styles.page} aria-busy="true">
      <SrLoading />
      <Backdrop index={open === 'daily' ? season : open === 'learn' ? paperOf(paper.learn).index : active} />
      {phone ? (
        <Worlds carousel>{columns.map(c => wide(c, c === open))}</Worlds>
      ) : (
        <Worlds>
          {columns.map(c => {
            if (c === open) return wide(c, true)
            const { index, className } = paperOf(paper[c])
            return (
              <SkeletonSpine
                key={c}
                paper={index}
                fog={c === 'campaign' && !campaign}
                className={className}
                pairs="menu"
                before={columns.indexOf(c) < columns.indexOf(open)}
                style={columnName(c)}
                name={c === 'campaign' ? <Bar w={24} h={140} /> : COLUMN_NAME[c]}
              />
            )
          })}
        </Worlds>
      )}
    </main>
  )
}

function CampaignStack({ campaign }: { campaign: Campaign | null }) {
  const crest = campaign?.crest
  return (
    <div className={styles.column}>
      <div className={styles.stack}>
        <Bar w="68%" h={14} />
        <Bar w="80%" h={52} />
        <Bar w={104} h={30} pill />
        <div className={styles.bar}>
          {Array.from({ length: campaign?.provinces.length ?? 6 }, (_, i) => (
            <Bar key={i} h={8} style={{ flex: 1 }} />
          ))}
        </div>
        <Bar w="46%" h={16} />
        <div className={styles.next}>
          <Ghost style={{ width: 64, height: 64 }} />
          <div className={styles.nextText}>
            <p className={styles.kicker}>Next up</p>
            <Bar w={160} h={20} style={{ margin: 'var(--space-1) 0' }} />
            <Bar w={90} h={16} />
          </div>
        </div>
        <div className={styles.actions}>
          <Bar w="100%" h={52} pill />
          <Bar w="100%" h={52} pill />
        </div>
      </div>
      <div className={styles.picture}>
        <Ghost style={{ width: 'min(100%, 520px)', aspectRatio: crest ? `${crest.width} / ${crest.height}` : 1 }} />
      </div>
    </div>
  )
}

function DailyStack({ today }: { today: string }) {
  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  const dates = datesOf(year, month)
  return (
    <div className={styles.column}>
      <div className={styles.stack}>
        <Bar w="58%" h={14} />
        <Bar w="45%" h={52} />
        <Bar w={104} h={30} pill />
        <div className={styles.bar}>
          {Array.from({ length: Math.ceil((dates.length + leadOf(year, month)) / 7) }, (_, i) => (
            <Bar key={i} h={8} style={{ flex: 1 }} />
          ))}
        </div>
        <Bar w="46%" h={16} />
        <div className={styles.next}>
          <Ghost style={{ width: 64, height: 64 }} />
          <div className={styles.nextText}>
            <p className={styles.kicker}>Today</p>
            <Bar w={160} h={20} style={{ margin: 'var(--space-1) 0' }} />
            <Bar w={120} h={16} />
          </div>
        </div>
        <div className={styles.actions}>
          <Bar w="100%" h={52} pill />
          <Bar w="100%" h={52} pill />
        </div>
      </div>
      <div className={styles.picture}>
        <MonthGridSkeleton year={year} month={month} />
      </div>
    </div>
  )
}

/** Any other open column: a heading, a few lines and a button. */
function ColumnStack() {
  return (
    <div className={styles.column}>
      <div className={styles.stack}>
        <Bar w="40%" h={14} />
        <Bar w="60%" h={48} />
        <Bar w="75%" h={16} />
        <Bar w="55%" h={16} />
        <Bar w={180} h={52} pill />
      </div>
    </div>
  )
}
