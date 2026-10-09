import type { Campaign } from '@pixel-imperium/protocol'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { shortDate, streakOf, weekOf } from '../profile/activity.ts'
import type { StickerEntry } from './stickers.ts'
import styles from './Cover.module.css'

interface Props {
  campaign: Pick<Campaign, 'provinces'>
  storage: ProgressStorage
  /** Every sticker the player has in the campaign. */
  stickers: readonly StickerEntry[]
  foil: number
  now: Date
}

/** The last seven days of solves on home, with a streak and a few all-time facts. */
export function ThisWeek({ campaign, storage, stickers, foil, now }: Props) {
  const times = campaign.provinces.flatMap(p =>
    p.puzzles.flatMap(puzzle => {
      const at = storage.loadSolvedAt(puzzle.id)
      return at ? [new Date(at)] : []
    }),
  )
  const days = weekOf(times, now)
  const streak = streakOf(times, now).current
  const biggest = stickers.reduce<StickerEntry['puzzle'] | null>(
    (big, { puzzle }) => (!big || puzzle.width * puzzle.height > big.width * big.height ? puzzle : big),
    null,
  )

  return (
    <section className={styles.card} aria-labelledby="week-title">
      <h2 id="week-title" className={`${styles.label} ${styles.weekHead}`}>
        This week
        {streak > 0 && <span>{streak}-day streak</span>}
      </h2>
      <div className={styles.week} aria-hidden="true">
        {days.map(d => (
          <i
            key={d.key}
            data-level={d.level || undefined}
            title={`${shortDate(new Date(`${d.key}T00:00`), now)}: ${d.count} ${d.count === 1 ? 'sticker' : 'stickers'}`}
          />
        ))}
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Solved</dt>
          <dd>{days.reduce((n, d) => n + d.count, 0)}</dd>
        </div>
        <div>
          <dt>Foil</dt>
          <dd>{stickers.length > 0 ? Math.round((foil / stickers.length) * 100) : 0}%</dd>
        </div>
        <div>
          <dt>Biggest</dt>
          <dd>{biggest ? `${biggest.width}×${biggest.height}` : '—'}</dd>
        </div>
      </dl>
    </section>
  )
}
