import { Link } from '@tanstack/react-router'
import { type CSSProperties, Fragment, type ReactNode } from 'react'
import type { Campaign, Province, Tier } from '@pixel-imperium/protocol'
import { Lock } from '../album/Lock.tsx'
import { Stamp } from '../album/Stamp.tsx'
import { useAccount } from '../account.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { NextUp } from './NextUp.tsx'
import { type CampaignProgress, campaignProgress, isOpen, tierGroups } from './progress.ts'
import { PuzzleSlot } from './PuzzleSlot.tsx'
import { Spine, World, Worlds } from './worlds/Worlds.tsx'
import styles from './Province.module.css'

export function ProvincePage({ campaign, province }: { campaign: Campaign; province: Province }) {
  const { storage } = useAccount()
  const progress = campaignProgress(campaign, storage)
  const { state } = progress.provinces[campaign.provinces.indexOf(province)]!

  if (!isOpen(state)) return <LockedProvince campaign={campaign} province={province} progress={progress} />
  return (
    <Zoomed campaign={campaign} province={province} progress={progress}>
      <OpenProvince campaign={campaign} province={province} progress={progress} storage={storage} />
    </Zoomed>
  )
}

/**
 * A province's page as Worlds zoomed in on it: its column fills the screen, the others stand as thin spines
 * either side. `children` is its column.
 */
function Zoomed({
  campaign,
  province,
  progress,
  children,
}: {
  campaign: Campaign
  province: Province
  progress: CampaignProgress
  children: ReactNode
}) {
  return (
    <main className={styles.page}>
      <Worlds>
        {campaign.provinces.map((p, i) => {
          if (p === province) return <Fragment key={p.id}>{children}</Fragment>
          const { state, solved, total } = progress.provinces[i]!
          return (
            <Spine
              key={p.id}
              campaignId={campaign.id}
              province={p}
              index={i}
              state={state}
              count={`${solved}/${total}`}
              thin
            />
          )
        })}
      </Worlds>
    </main>
  )
}

/** Slots stand this many deep on each tier's shelf, sized to share the column's height. */
const ROWS = 4

const TIER_NAME: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

/**
 * An open province: its slots on Easy / Medium / Hard shelves, Next up while it's active, its flavour and
 * the Page complete stamp once it's conquered.
 */
function OpenProvince({
  campaign,
  province,
  progress,
  storage,
}: {
  campaign: Campaign
  province: Province
  progress: CampaignProgress
  storage: ProgressStorage
}) {
  const index = campaign.provinces.indexOf(province)
  const { state, solved, total } = progress.provinces[index]!
  const next = state === 'active' ? province.puzzles.find(p => storage.loadSolved(p.id) === null) : undefined
  const groups = tierGroups(province)
  const columns = groups.map(g => Math.ceil(g.slots.length / ROWS))
  const id = `province-${province.id}`

  return (
    <World index={index} labelledBy={id}>
      <div className={styles.zoom}>
        <header className={styles.head}>
          <div className={styles.title}>
            <p className={styles.kicker}>
              Province {index + 1}
              {province.theme && ` · ${province.theme}`}
            </p>
            <h1 id={id} className={styles.name}>
              {province.name}
            </h1>
          </div>
          <span className={styles.count}>
            {solved} / {total}
          </span>
        </header>
        <div
          className={styles.shelves}
          style={{ '--shelves': columns.map(n => `minmax(0, ${n}fr)`).join(' ') } as CSSProperties}
        >
          {groups.map(({ tier, slots }, g) => {
            const first = slots[0]!.number
            const last = slots.at(-1)!.number
            return (
              <section key={tier} className={styles.shelf} aria-labelledby={`${id}-${tier}`}>
                <h2 id={`${id}-${tier}`} className={styles.tier}>
                  {TIER_NAME[tier]}
                  <small>{first === last ? first : `${first}–${last}`}</small>
                </h2>
                <ol className={styles.slots} style={{ '--cols': columns[g], '--rows': ROWS } as CSSProperties}>
                  {slots.map(({ puzzle, number }) => (
                    <li key={puzzle.id}>
                      <PuzzleSlot
                        puzzle={puzzle}
                        number={number}
                        storage={storage}
                        next={puzzle === next}
                        padDefault={puzzle === (next ?? province.puzzles[0])}
                      />
                    </li>
                  ))}
                </ol>
              </section>
            )
          })}
        </div>
        {state === 'conquered' ? (
          <footer className={styles.foot}>
            {province.flavour && <p className={styles.caption}>{province.flavour}</p>}
            <Stamp className={styles.stamp}>Page complete</Stamp>
          </footer>
        ) : (
          next && (
            <footer className={styles.foot}>
              <NextUp
                puzzle={next}
                number={province.puzzles.indexOf(next) + 1}
                storage={storage}
                fresh={progress.provinces.every(p => p.solved === 0)}
              />
            </footer>
          )
        )}
      </div>
    </World>
  )
}

/** Shown in place of a province, or one of its puzzles, that the player hasn't reached: its column in the fog. */
export function LockedProvince({
  campaign,
  province,
  progress,
}: {
  campaign: Campaign
  province: Province
  progress: CampaignProgress
}) {
  const index = campaign.provinces.indexOf(province)
  const active = campaign.provinces.find((_, i) => progress.provinces[i]!.state === 'active')
  const sizes = [...province.puzzles].sort((a, b) => a.width * a.height - b.width * b.height).map(p => `${p.width}×${p.height}`)
  const range = sizes.length === 0 ? '' : sizes[0] === sizes.at(-1) ? sizes[0] : `${sizes[0]} to ${sizes.at(-1)}`

  return (
    <Zoomed campaign={campaign} province={province} progress={progress}>
      <World index={index} fog labelledBy="locked-title">
        <div className={`${styles.zoom} ${styles.locked}`}>
          <div className={styles.sealed} aria-hidden="true">
            <div className={styles.ghosts}>
              {province.puzzles.map(p => (
                <i key={p.id} />
              ))}
            </div>
            <div className={styles.seal}>
              <span>
                <Lock className={styles.sealLock} />
                Locked
              </span>
            </div>
          </div>
          <div className={styles.lockedMsg}>
            <p className={styles.kicker}>Province {index + 1}</p>
            <h1 id="locked-title" className={styles.name}>
              {province.name}
            </h1>
            <p>
              {progress.provinces[index]!.state === 'next' && active
                ? `${province.name} opens once you conquer ${active.name}.`
                : 'This province is still in the fog. Conquer the provinces before it first.'}
              {range && ` ${province.puzzles.length} slots, ${range}.`}
            </p>
            {active && (
              <Link
                to="/c/$campaignId/$provinceId"
                params={{ campaignId: campaign.id, provinceId: active.id }}
                className={styles.paperLink}
                data-variant="paper"
              >
                Back to {active.name.replace(/^The /, 'the ')}
              </Link>
            )}
          </div>
        </div>
      </World>
    </Zoomed>
  )
}
