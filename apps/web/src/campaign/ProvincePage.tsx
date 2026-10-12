import { Link, useNavigate } from '@tanstack/react-router'
import { type CSSProperties, Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import type { Campaign, Province, Tier } from '@pixel-imperium/protocol'
import { CountPill, UNVEIL_LANDS_MS } from '../album/CountPill.tsx'
import { Lock } from '../album/Lock.tsx'
import { useAccount } from '../account.ts'
import { usePadPage } from '../pad/PadProvider.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { play } from '../sound.ts'
import { markConquestsSeen, unseenConquests } from './conquests-seen.ts'
import { NextUp } from './NextUp.tsx'
import { type CampaignProgress, campaignProgress, isOpen, tierGroups } from './progress.ts'
import { PuzzleSlot } from './PuzzleSlot.tsx'
import { Curtain, Spine, World, Worlds, morph, morphName, usePhone } from './worlds/Worlds.tsx'
import styles from './Province.module.css'

/**
 * The album: one province's page at a time, every other province a spine beside it; on a phone, a carousel of
 * whole pages. Moving to another province (a spine, a swipe, ←/→, LB/RB) replaces this page in history, so Back
 * leaves the album in one step.
 * The first time it shows the province a Conquest opened, that Conquest is unveiled: the conquered province's
 * count pill fills with its colour and its check slams in, then the fog drops off the new one. On a phone that's
 * two beats: the pill on the conquered page, then a glide over to the new one as its fog drops.
 */
export function ProvincePage(props: {
  campaign: Campaign
  province: Province
  /** Dev: replays the unveil for this conquered province id, or `true` for the latest conquered one. */
  previewConquest?: string | true | undefined
}) {
  const { generation } = useAccount()
  return <Album key={`${generation}:${props.campaign.id}`} {...props} />
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

/** How long a phone holds on the conquered page for its unveil before gliding on to the province it opened. */
const CONQUEST_BEAT = 900

function Album({
  campaign,
  province,
  previewConquest,
}: {
  campaign: Campaign
  province: Province
  previewConquest?: string | true | undefined
}) {
  const { storage } = useAccount()
  const navigate = useNavigate()
  const phone = usePhone()
  const progress = campaignProgress(campaign, storage)
  const index = campaign.provinces.indexOf(province)

  const preview = previewConquest !== undefined
  const [unveil, setUnveil] = useState<ReadonlySet<string>>(() => {
    const conquered = campaign.provinces.filter((_, i) => progress.provinces[i]!.state === 'conquered').map(p => p.id)
    const ids = previewConquest === true ? conquered.slice(-1) : previewConquest ? [previewConquest] : null
    return new Set(ids ?? unseenConquests(campaign.id, conquered))
  })
  const opened = campaign.provinces.findLast((_, i) => i > 0 && unveil.has(campaign.provinces[i - 1]!.id))
  const unveiling = opened === province
  // Leaving the province it opened ends the unveil, so coming back doesn't replay it.
  const [shown, setShown] = useState(province)
  if (shown !== province) {
    setShown(province)
    if (shown === opened) setUnveil(new Set())
  }
  const [conquestBeat, setConquestBeat] = useState(() => unveiling && phone && !reducedMotion())

  useEffect(() => {
    if (!unveiling) return
    if (!preview) markConquestsSeen(campaign.id, [...unveil])
    if (reducedMotion()) return
    const t = setTimeout(() => play('thunk'), UNVEIL_LANDS_MS)
    return () => clearTimeout(t)
  }, [unveiling, preview, campaign.id, unveil])
  useEffect(() => {
    if (!conquestBeat) return
    const t = setTimeout(() => setConquestBeat(false), CONQUEST_BEAT)
    return () => clearTimeout(t)
  }, [conquestBeat])

  const goTo = (to: Province | undefined, viewTransition: boolean) => {
    if (!to || to === province) return
    void navigate({
      to: '/c/$campaignId/$provinceId',
      params: { campaignId: campaign.id, provinceId: to.id },
      replace: true,
      viewTransition,
    })
  }
  const step = (dir: -1 | 1) => goTo(campaign.provinces[index + dir], morph())
  usePadPage({ step })
  const stepRef = useRef(step)
  stepRef.current = step
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, select, [contenteditable], dialog')) return
      if (document.querySelector('dialog[open]')) return
      e.preventDefault()
      stepRef.current(e.key === 'ArrowLeft' ? -1 : 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  const conquered = (p: Province) =>
    progress.provinces[campaign.provinces.indexOf(p)]!.state === 'conquered' || unveil.has(p.id)
  const thunk = (p: Province) => unveiling && unveil.has(p.id)
  const page = (p: Province) => {
    const i = campaign.provinces.indexOf(p)
    const current = p === province
    const start = conquestBeat ? i === index - 1 : current
    return isOpen(progress.provinces[i]!.state) || p === opened ? (
      <OpenProvince
        key={p.id}
        campaign={campaign}
        province={p}
        progress={progress}
        storage={storage}
        current={current}
        start={start}
        conquered={conquered(p)}
        unveil={thunk(p)}
        curtain={unveiling && current ? (phone ? 'late' : true) : false}
      />
    ) : (
      <LockedColumn key={p.id} campaign={campaign} province={p} progress={progress} current={current} start={start} />
    )
  }

  if (phone) {
    return (
      <main className={styles.page}>
        <Worlds carousel onSnap={i => goTo(campaign.provinces[i], false)}>
          {campaign.provinces.map(page)}
        </Worlds>
      </main>
    )
  }
  return (
    <Zoomed campaign={campaign} province={province} progress={progress} thunk={thunk}>
      {page(province)}
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
  thunk,
  children,
}: {
  campaign: Campaign
  province: Province
  progress: CampaignProgress
  /** Whose spine plays its conquest as it appears. */
  thunk: (p: Province) => boolean
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
              unveil={thunk(p)}
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
 * An open province: its slots on Easy / Medium / Hard shelves, Next up while it's active, its flavour once it's
 * conquered.
 */
function OpenProvince({
  campaign,
  province,
  progress,
  storage,
  current,
  start,
  conquered,
  unveil,
  curtain,
}: {
  campaign: Campaign
  province: Province
  progress: CampaignProgress
  storage: ProgressStorage
  /** The page the URL names, holding the pad's default. */
  current: boolean
  /** Where a carousel rests. */
  start: boolean
  /** Its count pill in its colour with a check; `unveil` plays that arriving. */
  conquered: boolean
  unveil: boolean
  /** The fog dropping off it, `late` to wait for a carousel's glide over. */
  curtain: boolean | 'late'
}) {
  const index = campaign.provinces.indexOf(province)
  const { state, solved, total } = progress.provinces[index]!
  const next = state === 'active' ? province.puzzles.find(p => storage.loadSolved(p.id) === null) : undefined
  const groups = tierGroups(province)
  const columns = groups.map(g => Math.ceil(g.slots.length / ROWS))
  const id = `province-${province.id}`

  return (
    <World index={index} labelledBy={id} style={morphName(province)} start={start}>
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
          <CountPill conquered={conquered} unveil={unveil} className={styles.count}>
            {solved} / {total}
          </CountPill>
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
                        padDefault={current && puzzle === (next ?? province.puzzles[0])}
                      />
                    </li>
                  ))}
                </ol>
              </section>
            )
          })}
        </div>
        {state === 'conquered' ? (
          province.flavour && (
            <footer className={styles.foot}>
              <p className={styles.caption}>{province.flavour}</p>
            </footer>
          )
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
      {curtain && <Curtain late={curtain === 'late'} />}
    </World>
  )
}

/** Shown in place of a puzzle in a province the player hasn't reached: the province's page in the fog. */
export function LockedProvince(props: { campaign: Campaign; province: Province; progress: CampaignProgress }) {
  return (
    <Zoomed {...props} thunk={() => false}>
      <LockedColumn {...props} current start />
    </Zoomed>
  )
}

/** A province the player hasn't reached: its column in the fog. */
function LockedColumn({
  campaign,
  province,
  progress,
  current,
  start,
}: {
  campaign: Campaign
  province: Province
  progress: CampaignProgress
  current: boolean
  start: boolean
}) {
  const index = campaign.provinces.indexOf(province)
  const titleId = `locked-${province.id}`
  const active = campaign.provinces.find((_, i) => progress.provinces[i]!.state === 'active')
  const sizes = [...province.puzzles].sort((a, b) => a.width * a.height - b.width * b.height).map(p => `${p.width}×${p.height}`)
  const range = sizes.length === 0 ? '' : sizes[0] === sizes.at(-1) ? sizes[0] : `${sizes[0]} to ${sizes.at(-1)}`

  return (
    <World index={index} fog labelledBy={titleId} style={morphName(province)} start={start}>
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
          <h1 id={titleId} className={styles.name}>
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
              replace
              viewTransition={morph()}
              className={styles.paperLink}
              data-variant="paper"
              data-pad-default={current || undefined}
            >
              Back to {active.name.replace(/^The /, 'the ')}
            </Link>
          )}
        </div>
      </div>
    </World>
  )
}
