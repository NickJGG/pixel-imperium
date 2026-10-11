import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { Campaign, Province, PuzzleClues, Tier } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { paperStyle } from '../album/paper.ts'
import { Stamp } from '../album/Stamp.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { type AccountState, useAccount } from '../account.ts'
import { requestHint, submitSolve } from '../api.ts'
import { campaignProgress, isOpen, nextPuzzle } from '../campaign/progress.ts'
import { LockedProvince } from '../campaign/ProvincePage.tsx'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { getPadMode, usePadMode } from '../pad/mode.ts'
import { PadControls } from '../pad/PadControls.tsx'
import { PadGlyph, PanelTag } from '../pad/PadGlyph.tsx'
import { usePadPage } from '../pad/PadProvider.tsx'
import { rumble } from '../pad/rumble.ts'
import { firstFocusable, focusDefault } from '../pad/spatial.ts'
import { Hud, HudPills, SoundButton, ThemeButton } from '../Hud.tsx'
import { getSettings, useSettings } from '../settings.ts'
import { play } from '../sound.ts'
import { useShouldOffer, useShouldOfferTechniques } from '../tutorial/asked.ts'
import { ChoiceCard, TUTORIAL_OFFER, techniquesOffer } from '../tutorial/ChoiceCard.tsx'
import { useLessonsDone } from '../tutorial/done.ts'
import { HowToPlay } from '../tutorial/HowToPlay.tsx'
import { TRACKS } from '../tutorial/tracks.ts'
import { AssistsDisclosure } from './AssistsDisclosure.tsx'
import { AssistSwitches } from './AssistSwitches.tsx'
import { Board, REVEAL_MS } from './Board.tsx'
import { ClearButton, LoopIcon } from './ClearButton.tsx'
import { ColClues, RowClues } from './Clues.tsx'
import { Dock } from './Dock.tsx'
import { useBoardGestures } from './gestures.ts'
import { HintButton } from './HintButton.tsx'
import { HintTag } from './HintTag.tsx'
import { RAIL_WIDTH, boardTracks, fitCellSize, useRail } from './layout.ts'
import { createLineHints } from './line-hints.ts'
import { Minimap } from './Minimap.tsx'
import { encodeCells } from './progress-storage.ts'
import { Filmstrip, PageHead, SlotRow } from './Filmstrip.tsx'
import { type Choreography, confetti, flyIn, popOnly } from './sticker-moment.ts'
import { type PlayState, PlayStore, crosshairOf, freshCells } from './store.ts'
import { ToolPill } from './ToolPill.tsx'
import { useUndoKeys } from './useUndoKeys.ts'
import { BoardView, fitView } from './viewport.ts'
import styles from './Play.module.css'

const route = getRouteApi('/play/$id')

export function PlayPage() {
  const { puzzle, campaign } = route.useLoaderData()
  const account = useAccount()
  const province = campaign.provinces.find(p => p.id === puzzle.provinceId)!
  const progress = campaignProgress(campaign, account.storage)
  if (!isOpen(progress.provinces[campaign.provinces.indexOf(province)]!.state)) {
    return (
      <>
        <Hud float />
        <LockedProvince campaign={campaign} province={province} progress={progress} />
      </>
    )
  }
  return (
    <Play
      key={`${account.generation}:${puzzle.id}`}
      puzzle={puzzle}
      campaign={campaign}
      province={province}
      account={account}
    />
  )
}

function useStoreValue<T>(store: PlayStore, select: (s: PlayState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()))
}

/**
 * A solve played in this visit. `waiting` holds for the reveal, `flying` carries the sticker to its
 * slot, `landed` stamps it. A replay's re-solve only `popping`s, then the sticker is `kept`.
 */
type Moment = 'waiting' | 'flying' | 'landed' | 'popping' | 'kept'

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches

function Play({
  puzzle,
  campaign,
  province,
  account: { storage, sync },
}: {
  puzzle: PuzzleClues
  campaign: Campaign
  province: Province
  account: AccountState
}) {
  const provinceIndex = campaign.provinces.indexOf(province)
  const number = province.puzzles.findIndex(p => p.id === puzzle.id) + 1
  const isConquered = () => campaignProgress(campaign, storage).provinces[provinceIndex]!.state === 'conquered'
  const [store] = useState(
    () =>
      new PlayStore(puzzle, {
        autoMarkEmptyLines: getSettings().autoMarkEmptyLines,
        storage,
        onSave: sync ? () => sync.markDirty(puzzle.id) : undefined,
      }),
  )
  const [boardView] = useState(() => new BoardView(puzzle, true))
  const boardRef = useBoardGestures(store, boardView)
  const solved = useStoreValue(store, s => s.solved)
  const [conqueredBefore] = useState(isConquered)
  const previewConquest = route.useSearch().conquest === true
  const conquest = previewConquest || (solved && !conqueredBefore && isConquered())
  const next = solved ? nextPuzzle(province.puzzles, puzzle.id, id => storage.loadSolved(id) !== null) : null
  const replaying = useStoreValue(store, s => s.replaying)
  const unverified = !solved && storage.loadSolved(puzzle.id) === 'unverified'
  const [firstSolve] = useState(() => storage.loadSolved(puzzle.id) === null)
  const hint = useStoreValue(store, s => s.hint)
  const hinted = useStoreValue(store, s => s.hinted)
  const [hintFailed, setHintFailed] = useState(false)
  const palette = useStoreValue(store, s => s.palette)
  const cells = useStoreValue(store, s => s.cells)
  const percent = useMemo(() => progressPercent(cells, puzzle.filledCount, false), [cells, puzzle.filledCount])
  const settings = useSettings()
  const pad = usePadMode()
  const offerTutorial = useShouldOffer(storage)
  const offerTechniques = useShouldOfferTechniques(province, useLessonsDone()) && !offerTutorial
  const fresh = useMemo(() => freshCells(puzzle, settings.autoMarkEmptyLines), [puzzle, settings.autoMarkEmptyLines])
  const canClear = useMemo(() => cells.some((c, i) => c !== fresh[i]), [cells, fresh])
  const crossRow = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.row ?? null) : null))
  const crossCol = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.col ?? null) : null))

  const [lineHints] = useState(() => createLineHints(puzzle))
  const hints = useMemo(() => lineHints(cells), [lineHints, cells])
  const { fadeClues, impossibleLines } = settings
  const assists = useMemo(() => ({ fade: fadeClues, impossible: impossibleLines }), [fadeClues, impossibleLines])

  const stageRef = useRef<HTMLDivElement>(null)
  const [cellSize, setCellSize] = useState(0)
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setCellSize(fitCellSize(entry!.contentRect, puzzle)))
    observer.observe(stageRef.current!)
    return () => observer.disconnect()
  }, [puzzle])
  const wide = useRail()

  useUndoKeys(store)

  // The local check already won; the server only supplies the reveal colors, so a failure just
  // sends the sticker off without them.
  const [revealFailed, setRevealFailed] = useState(false)
  useEffect(() => {
    if (!solved || store.getState().palette) return
    const abort = new AbortController()
    const cells = store.getState().cells.map(c => (c === 'filled' ? 'filled' : 'empty'))
    submitSolve(puzzle.id, { cells }, abort.signal).then(
      res => (res.solved ? store.setPalette(res.palette, res.foil) : setRevealFailed(true)),
      () => !abort.signal.aborted && setRevealFailed(true),
    )
    return () => abort.abort()
  }, [solved, store, puzzle.id])

  // A solve while zoomed glides back to fit before the reveal and the sticker's moment, so they
  // see the whole picture; the view stays locked there until a replay.
  const [fitting, setFitting] = useState(false)
  // Layout effects, like the moment's below, so a solve never paints a frame as if its sticker had landed.
  useLayoutEffect(() => {
    if (!solved) return
    let live = true
    if (boardView.zoomed) {
      setFitting(true)
      boardView.animateTo(fitView(boardView.fitCell), 450).then(() => live && setFitting(false))
    }
    boardView.locked = true
    return () => {
      live = false
      boardView.locked = false
      setFitting(false)
    }
  }, [solved, boardView])

  const [moment, setMoment] = useState<Moment | null>(null)
  const before = useRef({ solved, replaying })
  useLayoutEffect(() => {
    const prev = before.current
    before.current = { solved, replaying }
    if (!solved) setMoment(null)
    else if (!prev.solved) {
      if (!prev.replaying) setMoment('waiting')
      else if (!reducedMotion()) setMoment('popping')
      else {
        play('pop')
        setMoment('kept')
      }
    }
  }, [solved, replaying])

  useEffect(() => {
    if (moment !== 'waiting' || fitting || !(palette || revealFailed)) return
    if (reducedMotion()) return setMoment('landed')
    const timer = setTimeout(() => setMoment('flying'), palette ? REVEAL_MS : 0)
    return () => clearTimeout(timer)
  }, [moment, fitting, palette, revealFailed])

  const floatRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLElement | null>(null)
  const setSlot = (el: HTMLElement | null) => {
    slotRef.current = el
  }
  useLayoutEffect(() => {
    if ((moment !== 'flying' && moment !== 'popping') || fitting) return
    const float = floatRef.current!
    const board = stageRef.current!.querySelector(`.${styles.board} > canvas`)!.getBoundingClientRect()
    let choreography: Choreography
    if (moment === 'flying' && slotRef.current) {
      const slot = slotRef.current.getBoundingClientRect()
      float.style.width = `${slot.width * Math.min(1, puzzle.width / puzzle.height)}px`
      choreography = flyIn(float, board, slot, tiltOf(puzzle.id))
    } else {
      choreography = popOnly(float, board)
    }
    choreography.finished.then(
      () => setMoment(moment === 'flying' ? 'landed' : 'kept'),
      () => {},
    )
    return choreography.cancel
  }, [moment, fitting, puzzle.id])

  const afterRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (moment !== 'landed') return
    play(conquest ? 'chime' : 'thunk')
    rumble(conquest ? 'conquest' : 'solve')
    if (reducedMotion()) return
    return confetti((panelRef.current ?? afterRef.current)!, styles.burst!)
  }, [moment, conquest])

  const hideSticker = moment === 'waiting' || moment === 'flying'
  const done = previewConquest || (solved && !hideSticker)
  // Up before the flight, once the fit glide is over, so the sticker has a slot to fly to.
  const afterOpen = !wide && (done || (hideSticker && !fitting))

  usePadPage({
    parent: solved ? `/c/${campaign.id}/${province.id}` : undefined,
    panel: () => {
      if (!wide) return dockRef.current?.querySelector<HTMLElement>('[data-pad-menu]') ?? null
      const panel = panelRef.current
      return panel && (panel.querySelector<HTMLElement>(`.${styles.panelHint} button`) ?? firstFocusable(panel))
    },
    hold: hideSticker || moment === 'popping',
  })
  // The solve hands a controller on from the board to the onward link once it shows.
  useEffect(() => {
    if (!done || !getPadMode()) return
    const active = document.activeElement
    if (active === document.body || stageRef.current?.contains(active)) focusDefault()
  }, [done])
  const left = province.puzzles.filter(p => storage.loadSolved(p.id) === null).length
  const art = palette ?? Array<null>(puzzle.width * puzzle.height).fill(null)
  // Read at each render: the first solve settles it, and an account's server answer can overrule the device.
  const foil = storage.loadFoil(puzzle.id)
  const sticker = (
    <Sticker
      title={puzzle.title}
      width={puzzle.width}
      height={puzzle.height}
      palette={art}
      foil={foil}
      gold={number === GOLD_SLOT}
      tilt={tiltOf(puzzle.id)}
    />
  )

  const tag = replaying ? (
    <Dymo className={styles.tag}>
      <LoopIcon />
      Replaying
    </Dymo>
  ) : moment === 'kept' ? (
    <Dymo tone="pink" className={styles.tag}>
      Sticker kept
    </Dymo>
  ) : moment === 'landed' && foil ? (
    <Dymo tone="pink" className={styles.tag}>
      +1 foil
    </Dymo>
  ) : (
    unverified && <Dymo className={styles.tag}>Imported: replay to verify</Dymo>
  )

  const hintButton = (popover: boolean) => (
    <HintButton
      store={store}
      confirmFirst={firstSolve && !hinted}
      popover={popover}
      request={cells => requestHint(puzzle.id, { cells: encodeCells(cells) })}
      onError={setHintFailed}
    />
  )

  const controls = { lines: true, zoom: true, back: 'Back to page' }

  const following = campaign.provinces[provinceIndex + 1]
  const stamp = (className: string | undefined) =>
    conquest
      ? done && (
          <Stamp thunk tone={following ? 'pink' : 'gold'} className={className}>
            {following ? 'Page complete' : 'Album complete'}
          </Stamp>
        )
      : moment === 'landed' && (
          <Stamp thunk className={className}>
            New sticker!
          </Stamp>
        )
  const message = conquest ? (
    <p role="status">
      <b>{province.name} conquered.</b>
      {province.flavour && <span className={styles.flavour}>{province.flavour}</span>}
    </p>
  ) : (
    <p role="status">
      {moment === 'landed'
        ? `${puzzle.title} is in ${province.name}. ${left === 0 ? 'Page complete.' : `${left} to go.`}`
        : moment === 'kept'
          ? `Solved again. ${puzzle.title} stays where it is.`
          : `${puzzle.title} is in the album.`}
    </p>
  )
  const closing = conquest && !following && (
    <p className={styles.closing}>{campaign.closingLine || `${campaign.name} is yours.`}</p>
  )
  const onward = !conquest ? (
    next && (
      <Link to="/play/$id" params={{ id: next.id }} data-variant="primary" data-pad-default>
        Next: {next.title}
        <ArrowIcon />
        <PadGlyph button="A" />
      </Link>
    )
  ) : following ? (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId: campaign.id, provinceId: following.id }}
      data-variant="primary"
      data-pad-default
    >
      Open
      <span className={styles.tabChip} style={paperStyle(provinceIndex + 1)}>
        {following.name.replace(/^The /, '')}
      </span>
      <ArrowIcon />
      <PadGlyph button="A" />
    </Link>
  ) : (
    <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} data-variant="primary" data-pad-default>
      Back to the cover
      <PadGlyph button="A" />
    </Link>
  )
  const backToPage = (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId: campaign.id, provinceId: province.id }}
      data-variant="paper"
      data-pad-default={!onward || undefined}
    >
      Back to page
      <PadGlyph button="B" />
    </Link>
  )
  const replay = <ClearButton store={store} solved />
  const actions = (
    <div className={styles.btnRow}>
      <HowToPlay back={`/play/${puzzle.id}`} campaign={campaign} className={styles.howTo} />
      <ClearButton store={store} solved={false} disabled={!canClear} />
    </div>
  )
  const foilChip = replaying ? (
    <p className={styles.panelNote}>Already in the album. Replays never change the sticker.</p>
  ) : (
    firstSolve &&
    !hinted && (
      <span className={styles.foilNote}>
        <i aria-hidden="true" />
        Foil still possible
      </span>
    )
  )
  const slotRow = { province, number, storage, hideSticker }

  const afterBody = (
    <>
      {!conquest && tag}
      {message}
      {closing}
      {onward}
      <div className={styles.panelActions}>
        {replay}
        {backToPage}
      </div>
    </>
  )

  const meta = [`${puzzle.width}×${puzzle.height}`, puzzle.tier && TIER_NAME[puzzle.tier]].filter(Boolean).join(' · ')
  const backLink = (className: string | undefined) => (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId: campaign.id, provinceId: province.id }}
      className={className}
      aria-label={`Back to ${province.name}`}
    >
      ← <span>{province.name}</span>
    </Link>
  )
  const offer = offerTutorial ? (
    <ChoiceCard track={TRACKS.tutorial} copy={TUTORIAL_OFFER} puzzleId={puzzle.id} />
  ) : (
    offerTechniques && <ChoiceCard track={TRACKS.techniques} copy={techniquesOffer(province)} puzzleId={puzzle.id} />
  )

  // One tree for both layouts: the strip, rail and top line sit in fixed child positions around the
  // surface, so switching between them never remounts the surface or the board.
  return (
    <main className={styles.shell} data-rail={wide || undefined} style={paperStyle(provinceIndex)}>
      {!wide && (
        <header className={styles.topLine}>
          {backLink(styles.topBack)}
          <h1 className={styles.topTitle}>
            #{number} {puzzle.title}
          </h1>
          <span className={styles.topMeta}>{meta}</span>
          {!solved && <span className={styles.topPercent}>{percent}%</span>}
          {!done && tag}
          <span className={styles.topTools}>
            <SoundButton className={styles.round} variant="flat" size="compact" />
            <ThemeButton className={styles.round} variant="flat" size="compact" />
          </span>
        </header>
      )}
      <div className={styles.shellBody}>
        {wide && <Filmstrip {...slotRow} slotRef={setSlot} percent={solved ? null : percent} />}
        <div className={styles.surface}>
          <div ref={stageRef} className={styles.stage}>
            {cellSize > 0 && (
              <div
                ref={boardRef}
                className={styles.board}
                data-revealed={palette !== null || undefined}
                style={boardTracks(puzzle, cellSize) as CSSProperties}
              >
                <Minimap store={store} view={boardView} cellSize={cellSize} />
                <ColClues lines={puzzle.clues.cols} hints={hints.cols} active={crossCol} assists={assists} />
                <RowClues lines={puzzle.clues.rows} hints={hints.rows} active={crossRow} assists={assists} />
                <Board store={store} cellSize={cellSize} view={boardView} />
                {hint && <HintTag hint={hint} cells={cells} view={boardView} />}
              </div>
            )}
          </div>
          {!wide && offer}
        </div>
        {wide && (
          <aside
            ref={panelRef}
            className={styles.rail}
            style={{ width: RAIL_WIDTH }}
            data-pad-panel
            aria-label={`#${number} ${puzzle.title}`}
          >
            <HudPills className={styles.railPills} />
            <div className={styles.railTitle}>
              {backLink(styles.railBack)}
              <h1 className={styles.railName}>
                <Dymo>
                  #{number} {puzzle.title}
                </Dymo>
              </h1>
              <p className={styles.railMeta}>{meta}</p>
              {!done && tag}
            </div>
            {!solved && (
              <div className={styles.progress}>
                <span>
                  Progress <b>{percent}%</b>
                </span>
                <i style={{ '--percent': `${percent}%` } as CSSProperties} />
              </div>
            )}
            {done ? (
              <div className={styles.panelAfter}>
                {afterBody}
                <PadControls solved {...controls} />
              </div>
            ) : (
              <div className={styles.panelBody} inert={solved}>
                {foilChip}
                <div className={styles.panelHint}>
                  {hintButton(false)}
                  {hintFailed && (
                    <p className={styles.panelNote} role="status">
                      {HINT_FAILED}
                    </p>
                  )}
                  {firstSolve && hinted && (
                    <span className={styles.foilNote} data-lost>
                      <i aria-hidden="true" />
                      Hint used: regular sticker
                    </span>
                  )}
                </div>
                {actions}
                {pad ? <PadControls solved={false} {...controls} /> : <ToolPill store={store} docked />}
                <AssistsDisclosure store={store} />
              </div>
            )}
            {!done && <PanelTag />}
            {stamp(styles.railStamp)}
            {offer}
          </aside>
        )}
      </div>
      {!wide && (
        <Dock
          ref={dockRef}
          store={store}
          solved={solved}
          hint={hintButton(true)}
          paper={paperStyle(provinceIndex)}
          page={
            <>
              <PageHead {...slotRow} />
              <SlotRow {...slotRow} />
              {foilChip}
              {actions}
              <h2 className={styles.sheetHead}>Assists</h2>
              <AssistSwitches />
              <PadControls owner="board" solved={false} {...controls} />
            </>
          }
          note={hintFailed && <Dymo tone="pink">Couldn't reach the album</Dymo>}
        />
      )}
      {afterOpen && (
        <div ref={afterRef} className={`${styles.sheet} ${styles.afterSheet}`} style={paperStyle(provinceIndex)}>
          <div className={styles.sheetFace}>
            <SlotRow {...slotRow} slotRef={setSlot} />
            {/* Laid out but unseen until the sticker lands, so the slot row can't shift under its flight. */}
            <div className={styles.panelAfter} data-pending={!done || undefined}>
              {afterBody}
            </div>
          </div>
          {stamp(styles.sheetStamp)}
        </div>
      )}
      {(moment === 'flying' || moment === 'popping') && !fitting && (
        <div ref={floatRef} className={styles.float} aria-hidden="true">
          {sticker}
        </div>
      )}
    </main>
  )
}

const TIER_NAME: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

const HINT_FAILED = "Couldn't reach the album for a hint. Try again in a moment."

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
