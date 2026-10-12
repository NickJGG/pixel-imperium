import type { CSSProperties } from 'react'
import type { Campaign } from '@pixel-imperium/protocol'
import { paperStyle } from '../album/paper.ts'
import type { CampaignProgress } from '../campaign/progress.ts'
import type { StickerEntry } from '../campaign/stickers.ts'
import { CALENDAR_WEEKS, calendarOf, relativeDate, shortDate, streakOf } from './activity.ts'
import styles from './Profile.module.css'

interface Props {
  /** The id on the kicker heading, which labels the column. */
  titleId: string
  campaign: Pick<Campaign, 'provinces'>
  progress: CampaignProgress
  stickers: readonly StickerEntry[]
  /** The player's verified solves in the campaign, foil as theirs are. */
  solves: readonly { at: Date; foil: boolean }[]
  joinedAt: string
  now: Date
}

const joined = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })

/** A volume's Record column: stickers and foil, each page's progress, records and a calendar of solves. */
export function Summary({ titleId, campaign, progress, stickers, solves, joinedAt, now }: Props) {
  const total = progress.provinces.reduce((n, p) => n + p.total, 0)
  const foil = stickers.filter(s => s.foil).length
  const complete = progress.provinces.filter(p => p.state === 'conquered').length
  const biggest = stickers.reduce<StickerEntry['puzzle'] | null>(
    (big, { puzzle }) => (!big || puzzle.width * puzzle.height > big.width * big.height ? puzzle : big),
    null,
  )
  const streak = streakOf(solves.map(s => s.at), now)
  const last = solves.reduce<Date | null>((l, s) => (!l || s.at > l ? s.at : l), null)
  const days = calendarOf(solves, now)

  return (
    <>
      <h2 id={titleId} className={styles.kicker}>
        Record · joined {joined.format(new Date(joinedAt))}
      </h2>
      <p className={styles.hero}>
        {stickers.length}
        <span className={styles.of}> / {total}</span>
      </p>
      <p className={styles.foilLine}>
        <b>{foil}</b> foil{stickers.length > 0 && ` · ${Math.round((foil / stickers.length) * 100)}%`}
      </p>
      <div className={styles.segs} aria-hidden="true">
        {progress.provinces.map((p, i) => (
          <i
            key={campaign.provinces[i]!.id}
            style={{ ...paperStyle(i), '--p': `${(p.solved / Math.max(1, p.total)) * 100}%` } as CSSProperties}
          />
        ))}
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Pages complete</dt>
          <dd>
            {complete} / {campaign.provinces.length}
          </dd>
        </div>
        <div>
          <dt>Biggest solved</dt>
          <dd>{biggest ? `${biggest.width}×${biggest.height}` : '—'}</dd>
        </div>
        <div>
          <dt>Streak</dt>
          <dd>
            {streak.current} {streak.current === 1 ? 'day' : 'days'} <small>best {streak.best}</small>
          </dd>
        </div>
        <div>
          <dt>Cells filled</dt>
          <dd>{stickers.reduce((n, s) => n + s.puzzle.filledCount, 0).toLocaleString()}</dd>
        </div>
        <div>
          <dt>Last solve</dt>
          <dd>{last ? <time dateTime={last.toISOString()}>{relativeDate(last, now)}</time> : '—'}</dd>
        </div>
      </dl>
      <div className={styles.calWrap}>
        <div className={styles.cal} aria-hidden="true">
          {days.map(d => (
            <i
              key={d.key}
              data-level={d.level || undefined}
              data-foil={d.foil || undefined}
              data-future={d.future || undefined}
              title={
                d.future
                  ? undefined
                  : `${shortDate(new Date(`${d.key}T00:00`), now)}: ${d.count} ${d.count === 1 ? 'sticker' : 'stickers'}`
              }
            />
          ))}
        </div>
        <p className={styles.calKey}>
          <span>{CALENDAR_WEEKS} weeks</span>
          <span className={styles.keyScale}>
            less <i /> <i data-level="1" /> <i data-level="2" /> <i data-level="3" /> more · <i data-foil /> foil
          </span>
        </p>
      </div>
    </>
  )
}
