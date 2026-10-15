/**
 * A draft campaign played through as a Player would: provinces unlock on Conquest, the album fills with stickers, and
 * nothing is saved. Solves last for the tab's life, so the album and the boards agree; Start over clears them.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { type CSSProperties, Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Campaign, Province } from '@pixel-imperium/protocol'
import { CountPill } from '../album/CountPill.tsx'
import { Lock } from '../album/Lock.tsx'
import { TIER_NAME } from '../campaign/ProvincePage.tsx'
import { SlotFace } from '../campaign/PuzzleSlot.tsx'
import { type CampaignProgress, isOpen, provinceStates, shelfLayout, tierGroups } from '../campaign/progress.ts'
import { Backdrop, DraftProvinceSpine, World, Worlds, draftProvinceMorph, usePhone, useSpineReach, useStep } from '../campaign/worlds/Worlds.tsx'
import { FloatingPills } from '../Hud.tsx'
import type { Draft } from '../make/draft.ts'
import { localDrafts } from '../make/draft-store.ts'
import { PlaytestBoard, playtestStore, useStoreValue } from '../make/Playtest.tsx'
import { Stage } from '../make/Stage.tsx'
import { RAIL_WIDTH } from '../play/layout.ts'
import { PlaytestStorage } from '../play/playtest-storage.ts'
import { RailTools } from '../play/RailTools.tsx'
import { useHudTrail } from '../Trail.tsx'
import { draftTrail } from './BuilderPage.tsx'
import { draftAsCampaign, puzzleInfos } from './campaign-draft.ts'
import { type CampaignKey, type StoredCampaign, flushOnLeave, openCampaign, useCampaign } from './campaign-store.ts'
import { type Workshop, mergeDrafts, titleOf, yourPuzzles } from './workshop.ts'
import provinceStyles from '../campaign/Province.module.css'
import campaignStyles from '../campaign/Campaign.module.css'
import playStyles from '../play/Play.module.css'
import makeStyles from '../make/Make.module.css'
import styles from './Builder.module.css'

/** Each playtest's solves, by draft id: the revealed picture by puzzle ref. */
const sessions = new Map<string, Map<string, (string | null)[]>>()

const solvesOf = (id: string) => {
  let solves = sessions.get(id)
  if (!solves) sessions.set(id, (solves = new Map()))
  return solves
}

/** The draft as the album sees it, the playtest's storage, and where it stands. */
function usePlaytest(draftKey: CampaignKey, opening: StoredCampaign, workshop: Workshop) {
  useState(() => openCampaign(draftKey, opening))
  useEffect(flushOnLeave, [])
  const { doc, preview } = useCampaign() ?? opening
  const [local] = useState(() => localDrafts(draftKey.userId))
  const infos = useMemo(
    () => puzzleInfos(yourPuzzles(mergeDrafts(workshop.drafts.puzzles, local), workshop.made), local),
    [workshop, local],
  )
  const campaign = draftAsCampaign(draftKey.id, doc, preview, infos)
  const solves = solvesOf(draftKey.id)
  const storage = new PlaytestStorage(solves)
  const progress = provinceStates(campaign, id => solves.has(id))
  return { doc, campaign, storage, progress, solves }
}

export function PlaytestAlbum({
  draftKey,
  opening,
  workshop,
  n,
}: {
  draftKey: CampaignKey
  opening: StoredCampaign
  workshop: Workshop
  n: number
}) {
  const { doc, campaign, storage, progress, solves } = usePlaytest(draftKey, opening, workshop)
  const navigate = useNavigate()
  const phone = usePhone()
  const [, restart] = useState(0)
  useHudTrail(draftTrail(draftKey.id, doc))
  const k = Math.min(Math.max(0, n - 1), campaign.provinces.length - 1)
  const goTo = (to: number) => {
    if (to < 0 || to >= campaign.provinces.length || to === k) return
    void navigate({ to: '/workshop/c/$id/playtest/$n', params: { id: draftKey.id, n: String(to + 1) }, replace: true })
  }
  useStep(dir => goTo(k + dir))
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)
  const startOver = () => {
    solves.clear()
    restart(r => r + 1)
    goTo(0)
  }

  const page = (p: Province, j: number) =>
    isOpen(progress.provinces[j]!.state) ? (
      <PlaytestProvince
        key={p.id}
        draftId={draftKey.id}
        campaign={campaign}
        province={p}
        k={j}
        progress={progress}
        storage={storage}
        start={j === k}
        onStartOver={startOver}
      />
    ) : (
      <LockedPlaytest key={p.id} draftId={draftKey.id} campaign={campaign} province={p} k={j} progress={progress} start={j === k} />
    )

  if (campaign.provinces.length === 0) {
    return (
      <main className={provinceStyles.page}>
        <p className={styles.emptyPlaytest}>No provinces to play yet.</p>
      </main>
    )
  }
  if (phone) {
    return (
      <main ref={ref} className={provinceStyles.page}>
        <Worlds carousel onSnap={goTo}>
          {campaign.provinces.map(page)}
        </Worlds>
      </main>
    )
  }
  return (
    <main ref={ref} className={provinceStyles.page}>
      <Backdrop paper={campaign.provinces[k]!.paper} />
      <Worlds>
        {campaign.provinces.map((p, j) => {
          if (j === k) return <Fragment key={p.id}>{page(p, j)}</Fragment>
          const { state, solved, total } = progress.provinces[j]!
          return (
            <DraftProvinceSpine
              key={p.id}
              draftId={draftKey.id}
              n={j + 1}
              name={p.name}
              paper={p.paper}
              count={total > 0 ? `${solved}/${total}` : null}
              state={state}
              playtest
            />
          )
        })}
      </Worlds>
    </main>
  )
}

function PlaytestProvince({
  draftId,
  campaign,
  province,
  k,
  progress,
  storage,
  start,
  onStartOver,
}: {
  draftId: string
  campaign: Campaign
  province: Province
  k: number
  progress: CampaignProgress
  storage: PlaytestStorage
  start: boolean
  onStartOver: () => void
}) {
  const { state, solved, total } = progress.provinces[k]!
  const next = province.puzzles.findIndex(p => storage.loadSolved(p.id) === null)
  const groups = tierGroups(province)
  const { rows, columns } = shelfLayout(groups.map(g => g.slots.length))
  const tiered = province.puzzles.some(p => p.tier)
  const id = `playtest-${k + 1}`
  return (
    <World paper={province.paper} labelledBy={id} style={draftProvinceMorph(k + 1)} start={start} pair={start}>
      <div className={provinceStyles.zoom}>
        <header className={provinceStyles.head}>
          <div className={provinceStyles.title}>
            <p className={provinceStyles.kicker}>
              Playtest · {titleOf(campaign.name)} · Province {k + 1}
            </p>
            <h1 id={id} className={provinceStyles.name}>
              {province.name}
            </h1>
          </div>
          <CountPill conquered={state === 'conquered'} className={provinceStyles.count}>
            {solved} / {total}
          </CountPill>
        </header>
        <div className={provinceStyles.shelves} style={{ '--shelves': columns.map(c => `minmax(0, ${c}fr)`).join(' ') } as CSSProperties}>
          {groups.map(({ tier, slots }, g) => (
            <section key={tier} className={provinceStyles.shelf} aria-labelledby={`${id}-${tier}`}>
              <h2 id={`${id}-${tier}`} className={provinceStyles.tier}>
                {tiered ? TIER_NAME[tier] : 'Puzzles'}
                <small>{slots[0]!.number === slots.at(-1)!.number ? slots[0]!.number : `${slots[0]!.number}–${slots.at(-1)!.number}`}</small>
              </h2>
              <ol className={provinceStyles.slots} style={{ '--cols': columns[g], '--rows': rows } as CSSProperties}>
                {slots.map(({ puzzle, number }) => (
                  <li key={`${number}:${puzzle.id}`}>
                    <Link
                      to="/workshop/c/$id/playtest/$n/$slot"
                      params={{ id: draftId, n: String(k + 1), slot: String(number) }}
                      className={campaignStyles.slotLink}
                      data-pad-default={(start && number === next + 1) || undefined}
                      aria-label={`${number}: ${storage.loadSolved(puzzle.id) ? puzzle.title : `${puzzle.width}×${puzzle.height}`}`}
                    >
                      <SlotFace puzzle={puzzle} number={number} storage={storage} next={number === next + 1 && state === 'active'} />
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
        <footer className={provinceStyles.foot}>
          <button type="button" data-variant="paper" onClick={onStartOver}>
            Start over
          </button>
          {next !== -1 && (
            <Link
              to="/workshop/c/$id/playtest/$n/$slot"
              params={{ id: draftId, n: String(k + 1), slot: String(next + 1) }}
              data-variant="primary"
            >
              {progress.provinces.every(p => p.solved === 0) ? 'Start' : 'Continue'}
            </Link>
          )}
          {state === 'conquered' && province.flavour && <p className={provinceStyles.caption}>{province.flavour}</p>}
        </footer>
      </div>
    </World>
  )
}

function LockedPlaytest({
  draftId,
  campaign,
  province,
  k,
  progress,
  start,
}: {
  draftId: string
  campaign: Campaign
  province: Province
  k: number
  progress: CampaignProgress
  start: boolean
}) {
  const active = campaign.provinces.findIndex((_, j) => progress.provinces[j]!.state === 'active')
  const id = `playtest-locked-${k + 1}`
  return (
    <World paper={province.paper} fog labelledBy={id} style={draftProvinceMorph(k + 1)} start={start}>
      <div className={`${provinceStyles.zoom} ${provinceStyles.locked}`}>
        <div className={provinceStyles.lockedMsg}>
          <Lock className={provinceStyles.sealLock} />
          <p className={provinceStyles.kicker}>Playtest · Province {k + 1}</p>
          <h1 id={id} className={provinceStyles.name}>
            {province.name}
          </h1>
          <p>
            {province.puzzles.length === 0
              ? 'It has no puzzles yet, so it can’t be conquered.'
              : `It opens once you conquer ${campaign.provinces[active]?.name ?? 'the province before it'}.`}
          </p>
          {active !== -1 && (
            <Link
              to="/workshop/c/$id/playtest/$n"
              params={{ id: draftId, n: String(active + 1) }}
              replace
              data-variant="paper"
              data-pad-default={start || undefined}
            >
              Back to {campaign.provinces[active]!.name}
            </Link>
          )}
        </div>
      </div>
    </World>
  )
}

/** One of the draft's puzzles on the real board; its solve counts toward the playtest's unlocks. */
export function PlaytestPuzzle({
  draftKey,
  opening,
  workshop,
  n,
  slot,
  picture,
}: {
  draftKey: CampaignKey
  opening: StoredCampaign
  workshop: Workshop
  n: number
  slot: number
  /** `null` when neither this device nor the server has the puzzle. */
  picture: Draft | null
}) {
  const { campaign, progress, solves } = usePlaytest(draftKey, opening, workshop)
  const k = n - 1
  const province = campaign.provinces[k]
  const puzzle = province?.puzzles[slot - 1]
  const open = province !== undefined && isOpen(progress.provinces[k]!.state)
  const [store] = useState(() => (picture && picture.cells.some(c => c !== null) ? playtestStore(picture) : null))
  const back = { to: '/workshop/c/$id/playtest/$n', params: { id: draftKey.id, n: String(n) } } as const

  if (!province || !puzzle || !open || !store || !picture) {
    return (
      <main className={styles.emptyPlaytest}>
        <p>{!open ? 'That province is still locked in this playtest.' : 'This puzzle has nothing drawn yet.'}</p>
        <Link {...back} data-variant="primary">
          Back to the album
        </Link>
      </main>
    )
  }
  return <PlaytestBoardPage store={store} picture={picture} province={province} slot={slot} back={back} solves={solves} draftId={draftKey.id} n={n} />
}

function PlaytestBoardPage({
  store,
  picture,
  province,
  slot,
  back,
  solves,
  draftId,
  n,
}: {
  store: ReturnType<typeof playtestStore>
  picture: Draft
  province: Province
  slot: number
  back: { to: '/workshop/c/$id/playtest/$n'; params: { id: string; n: string } }
  solves: Map<string, (string | null)[]>
  draftId: string
  n: number
}) {
  const puzzle = province.puzzles[slot - 1]!
  // A skip to the reveal counts as a solve, so the rest of the campaign can be walked without solving every board.
  const solved = useStoreValue(store, s => s.palette !== null)
  useEffect(() => {
    if (solved) solves.set(puzzle.id, picture.cells)
  }, [solved, solves, puzzle.id, picture])
  const next = province.puzzles.findIndex((p, i) => i !== slot - 1 && !solves.has(p.id))
  const clues = store.puzzle

  return (
    <main className={`${playStyles.shell} ${makeStyles.make}`} data-rail style={{ '--paper': 'var(--p-workshop)', '--tab': 'var(--t-workshop)' } as CSSProperties}>
      <FloatingPills />
      <div className={playStyles.shellBody}>
        <Stage puzzle={clues}>{cellSize => <PlaytestBoard store={store} draft={picture} cellSize={cellSize} />}</Stage>
        <div className={`${playStyles.rail} ${playStyles.underPills} ${makeStyles.rail}`} style={{ width: RAIL_WIDTH }}>
          <div className={playStyles.railHead}>
            <p className={playStyles.railKicker}>
              Playtest · {province.name} · #{slot}
            </p>
            <h1 className={playStyles.railName}>{solved ? puzzle.title : `${puzzle.width}×${puzzle.height}`}</h1>
            <p className={`${playStyles.railNote} ${makeStyles.tight}`}>Nothing here is saved.</p>
          </div>
          <div className={playStyles.railBody}>
            <RailTools store={store} />
            <div className={playStyles.railFoot}>
              {solved && next !== -1 && (
                <Link
                  to="/workshop/c/$id/playtest/$n/$slot"
                  params={{ id: draftId, n: String(n), slot: String(next + 1) }}
                  replace
                  data-variant="primary"
                >
                  Next puzzle
                </Link>
              )}
              {!solved && (
                <button type="button" data-variant="primary" className={makeStyles.playtest} onClick={() => store.setPalette(picture.cells)}>
                  Skip to reveal
                </button>
              )}
              <Link {...back} replace data-variant={solved && next === -1 ? 'primary' : 'paper'}>
                Back to {province.name}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
