import { useParams } from '@tanstack/react-router'
import { useRef } from 'react'
import { seasonOf } from '../album/paper.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import { Backdrop, SkeletonSpine, World, Worlds, monthMorphName, usePhone, useSpineReach } from '../campaign/worlds/Worlds.tsx'
import { dayKey } from '../profile/activity.ts'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { MONTH_NAMES, tallyOf } from './month.ts'
import { MonthGridSkeleton } from './MonthCalendar.tsx'
import { currentDailyYear } from './year.ts'
import styles from './Daily.module.css'
import provinceStyles from '../campaign/Province.module.css'
import campaignStyles from '../campaign/Campaign.module.css'

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

/**
 * A Month's page while it loads: its calendar's slots under the weekday headers, the other Months as spines, or a
 * carousel on a phone. Which Months are in the fog comes from the Year last loaded, when it's this one. Its column
 * and spines pair with the page it's leaving, so a morph can play into it.
 */
export function MonthSkeleton() {
  const params = useParams({ from: '/daily/$year/$month' })
  const year = Number(params.year)
  const month = Math.min(Math.max(Number(params.month) || 1, 1), 12)
  const phone = usePhone()
  const cached = currentDailyYear()
  const data = cached?.year === year ? cached : null
  const today = dayKey(new Date())
  const dim = (m: number) => (data ? tallyOf(year, m, data.launch, today, () => false).dim : false)
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)
  useAnnounceSkeleton()

  const column = (m: number) => (
    <World key={m} index={seasonOf(m)} fog={dim(m)} style={monthMorphName(m)} start={m === month} pair={m === month}>
      <div className={provinceStyles.zoom}>
        <header className={provinceStyles.head}>
          <div className={provinceStyles.title}>
            <p className={provinceStyles.kicker}>Daily {year}</p>
            <h1 className={provinceStyles.name}>{MONTH_NAMES[m - 1]}</h1>
          </div>
          <Bar w={96} h={30} pill />
        </header>
        <div className={styles.fit}>
          <MonthGridSkeleton year={year} month={m} />
        </div>
        <footer className={provinceStyles.foot}>
          <Bar w="min(52ch, 50%)" h={18} />
          <div className={campaignStyles.nextUp}>
            <Ghost style={{ width: 64, height: 64 }} />
            <div className={campaignStyles.nextText}>
              <Bar w={150} h={18} />
              <Bar w={60} h={14} style={{ marginTop: 2 }} />
            </div>
          </div>
        </footer>
      </div>
    </World>
  )

  return (
    <main ref={ref} className={provinceStyles.page} aria-busy="true">
      <SrLoading />
      <Backdrop index={seasonOf(month)} />
      <Worlds carousel={phone}>
        {MONTHS.map(m =>
          m === month || phone ? (
            column(m)
          ) : (
            <SkeletonSpine
              key={m}
              paper={seasonOf(m)}
              state={dim(m) ? 'locked' : 'active'}
              thin
              pairs="province"
              style={monthMorphName(m)}
              name={MONTH_NAMES[m - 1]}
            >
              {!dim(m) && <Bar w={44} h={22} pill />}
            </SkeletonSpine>
          ),
        )}
      </Worlds>
    </main>
  )
}
