import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Link, getRouteApi } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { Campaign, Province, PuzzleClues } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { paperStyle } from '../album/paper.ts'
import { Stamp } from '../album/Stamp.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { type AccountState, useAccount } from '../account.ts'
import { requestHint, submitSolve } from '../api.ts'
import { campaignProgress, isOpen, nextPuzzle } from '../campaign/progress.ts'
import { LockedProvince } from '../campaign/ProvincePage.tsx'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { getPadMode } from '../pad/mode.ts'
import { PadControls, PadStrip } from '../pad/PadControls.tsx'
import { PadGlyph, PanelTag } from '../pad/PadGlyph.tsx'
import { usePadPage } from '../pad/PadProvider.tsx'
import { rumble } from '../pad/rumble.ts'
import { firstFocusable, focusDefault } from '../pad/spatial.ts'
import { usePlaySlot } from '../playSlot.ts'
import { getSettings, useSettings } from '../settings.ts'
import { play } from '../sound.ts'
import { useShouldOffer, useShouldOfferTechniques } from '../tutorial/asked.ts'
import { ChoiceCard, TUTORIAL_OFFER, techniquesOffer } from '../tutorial/ChoiceCard.tsx'
import { useLessonsDone } from '../tutorial/done.ts'
import { HowToPlay } from '../tutorial/HowToPlay.tsx'
import { TRACKS } from '../tutorial/tracks.ts'
import { AssistSwitches } from './AssistSwitches.tsx'
import { Board, REVEAL_MS } from './Board.tsx'
import { ClearButton, LoopIcon } from './ClearButton.tsx'
import { ColClues, RowClues } from './Clues.tsx'
import { ControlsCard } from './ControlsCard.tsx'
import { useBoardGestures } from './gestures.ts'
import { HintButton, hintText } from './HintButton.tsx'
import { RAIL_WIDTH, boardTracks, fitCellSize, useRail } from './layout.ts'
import { createLineHints } from './line-hints.ts'
import { Minimap } from './Minimap.tsx'
import { MoreMenu } from './MoreMenu.tsx'
import { encodeCells } from './progress-storage.ts'
import { PuzzlePanel, SlotRow } from './PuzzlePanel.tsx'
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
    return <LockedProvince campaign={campaign} province={province} progress={progress} />
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
  useEffect(() => {
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
  useEffect(() => {
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
    // Until the dock has a slot to fly to, its solve only pops.
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

  const surfaceRef = useRef<HTMLDivElement>(null)
  const dockRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (moment !== 'landed') return
    play(conquest ? 'chime' : 'thunk')
    rumble(conquest ? 'conquest' : 'solve')
    if (reducedMotion()) return
    return confetti((panelRef.current ?? surfaceRef.current)!, styles.burst!)
  }, [moment, conquest])

  const hideSticker = moment === 'waiting' || moment === 'flying'
  const done = previewConquest || (solved && !hideSticker)

  usePadPage({
    parent: solved ? `/c/${campaign.id}/${province.id}` : undefined,
    panel: () => {
      if (!wide) return dockRef.current?.querySelector<HTMLElement>('[data-pad-menu]') ?? null
      const panel = panelRef.current
      return panel && (panel.querySelector<HTMLElement>(`.${styles.panelHint} button`) ?? firstFocusable(panel))
    },
    menu: wide && !solved ? () => panelRef.current?.querySelector<HTMLElement>('[role="switch"]')?.focus() : undefined,
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
  const conquestStamp = (className: string | undefined) => (
    <Stamp thunk tone={following ? 'pink' : 'gold'} className={className}>
      {following ? 'Page complete' : 'Album complete'}
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
      <Link to="/play/$id" params={{ id: next.id }} className={styles.linkButton} data-pad-default>
        Next: {next.title}
        <ArrowIcon />
        <PadGlyph button="A" />
      </Link>
    )
  ) : following ? (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId: campaign.id, provinceId: following.id }}
      className={styles.linkButton}
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
    <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} className={styles.linkButton} data-pad-default>
      Back to the cover
      <PadGlyph button="A" />
    </Link>
  )
  const backToPage = (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId: campaign.id, provinceId: province.id }}
      className={`${styles.linkButton} ${styles.paper}`}
      data-pad-default={!onward || undefined}
    >
      Back to page
      <PadGlyph button="B" />
    </Link>
  )
  const replay = <ClearButton store={store} solved />
  const learn = (
    <div className={styles.learn}>
      <HowToPlay back={`/play/${puzzle.id}`} campaign={campaign} className={styles.howTo} />
    </div>
  )

  const afterBody = (
    <>
      {message}
      {closing}
      {onward}
      <div className={styles.panelActions}>
        {replay}
        {backToPage}
      </div>
    </>
  )

  const playSlot = usePlaySlot()
  const barPuzzle =
    playSlot &&
    createPortal(
      <>
        <Link
          to="/c/$campaignId/$provinceId"
          params={{ campaignId: campaign.id, provinceId: province.id }}
          className={styles.barBack}
          aria-label={`Back to ${province.name}`}
        >
          ← <span className={styles.barCrumb}>{province.name}</span>
        </Link>
        <h1 className={styles.barTitle}>
          #{number} {puzzle.title}
        </h1>
        <span className={styles.barSize}>
          {puzzle.width}×{puzzle.height}
        </span>
        {!solved && <span className={styles.barPercent}>{percent}%</span>}
        {!done && tag}
      </>,
      playSlot,
    )

  // One tree for both layouts, so switching between them never remounts the surface or the board.
  return (
    <main className={styles.shell}>
      {barPuzzle}
      <div className={styles.shellBody}>
        <div ref={surfaceRef} className={styles.surface}>
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
              </div>
            )}
          </div>
          {moment === 'landed' && !wide && !conquest && (
            <Stamp thunk className={styles.cardStamp}>
              New sticker!
            </Stamp>
          )}
          {offerTutorial && <ChoiceCard track={TRACKS.tutorial} copy={TUTORIAL_OFFER} puzzleId={puzzle.id} />}
          {offerTechniques && (
            <ChoiceCard track={TRACKS.techniques} copy={techniquesOffer(province)} puzzleId={puzzle.id} />
          )}
        </div>
        {wide && (
          <div className={styles.side} style={{ width: RAIL_WIDTH }}>
            <PuzzlePanel
              ref={panelRef}
              slotRef={setSlot}
              campaignId={campaign.id}
              province={province}
              index={provinceIndex}
              number={number}
              storage={storage}
              hideSticker={hideSticker}
              stamp={
                conquest
                  ? done && conquestStamp(styles.panelStamp)
                  : moment === 'landed' && (
                      <Stamp thunk className={styles.panelStamp}>
                        New sticker!
                      </Stamp>
                    )
              }
              tag={null}
            >
              {done ? (
                <div className={styles.panelAfter}>
                  {!conquest && tag}
                  {afterBody}
                </div>
              ) : (
                <div className={styles.panelBody} inert={solved}>
                  <div className={styles.progress}>
                    <span className={styles.bar}>
                      <i style={{ width: `${percent}%` }} />
                    </span>
                    <span className={styles.size}>{percent}% filled</span>
                  </div>
                  {replaying ? (
                    <p className={styles.panelNote}>Already in the album. Replays never change the sticker.</p>
                  ) : (
                    firstSolve &&
                    !hinted && (
                      <span className={styles.foilNote}>
                        <i aria-hidden="true" />
                        Foil still possible
                      </span>
                    )
                  )}
                  <div className={styles.panelHint}>
                    {hintButton(false)}
                    {hint ? (
                      <p role="status">
                        <Dymo tone="pink">{hintText(hint, cells, puzzle.width)}</Dymo>
                      </p>
                    ) : (
                      hintFailed && (
                        <p className={styles.panelNote} role="status">
                          Couldn't reach the album for a hint. Try again in a moment.
                        </p>
                      )
                    )}
                    {firstSolve && hinted && (
                      <span className={styles.foilNote} data-lost>
                        <i aria-hidden="true" />
                        Hint used: regular sticker
                      </span>
                    )}
                  </div>
                  <AssistSwitches />
                  <div className={styles.panelFoot}>
                    {learn}
                    <ClearButton store={store} solved={false} disabled={!canClear} />
                  </div>
                </div>
              )}
              {!done && <PanelTag />}
            </PuzzlePanel>
            <ControlsCard solved={solved} {...controls}>
              {!solved && <ToolPill store={store} docked />}
            </ControlsCard>
          </div>
        )}
      </div>
      {!wide && (
        // Stays through the solve, under the after card, so the board never refits under the sticker.
        <div ref={dockRef} className={styles.playDock} inert={solved}>
          <PadStrip />
          <div className={styles.dockRow}>
            <ToolPill store={store} compact>
              {hintButton(true)}
            </ToolPill>
            <MoreMenu store={store} paper={paperStyle(provinceIndex)}>
              <SlotRow province={province} number={number} storage={storage} hideSticker={hideSticker} />
              <AssistSwitches />
              <div className={styles.panelFoot}>
                {learn}
                <ClearButton store={store} solved={false} disabled={!canClear} />
              </div>
              <PadControls owner="board" solved={false} {...controls} />
            </MoreMenu>
          </div>
          <p className={styles.visuallyHidden} role="status">
            {hint
              ? hintText(hint, cells, puzzle.width)
              : hintFailed && "Couldn't reach the album for a hint. Try again in a moment."}
          </p>
        </div>
      )}
      {!wide && done && (
        <div className={`${styles.panelAfter} ${styles.afterCard}`}>
          {conquest ? conquestStamp(styles.afterStamp) : tag}
          {afterBody}
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

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
