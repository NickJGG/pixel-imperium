import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { Campaign, Province, PuzzleClues, SolveRequest, Tier } from '@pixel-imperium/protocol'
import { CountPill } from '../album/CountPill.tsx'
import { Dymo } from '../album/Dymo.tsx'
import { ArrowIcon, CheckIcon } from '../album/icons.tsx'
import { paperFor } from '../album/paper.ts'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { type AccountState, useAccount } from '../account.ts'
import { requestHint, submitSolve } from '../api.ts'
import { campaignProgress, isOpen, nextPuzzle } from '../campaign/progress.ts'
import { NextUp } from '../campaign/NextUp.tsx'
import { LockedProvince } from '../campaign/ProvincePage.tsx'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { boardMorph, columnPaper, slotName } from '../campaign/worlds/names.ts'
import { getPadMode } from '../pad/mode.ts'
import { PadControls } from '../pad/PadControls.tsx'
import { PadGlyph, PanelTag } from '../pad/PadGlyph.tsx'
import { usePadPage } from '../pad/PadProvider.tsx'
import { rumble } from '../pad/rumble.ts'
import { firstFocusable, focusDefault } from '../pad/spatial.ts'
import { FloatingPills, Hud, SoundButton, ThemeButton } from '../Hud.tsx'
import { getSettings, useSettings } from '../settings.ts'
import { reducedMotion } from '../motion.ts'
import { play } from '../sound.ts'
import { useShouldOffer, useShouldOfferTechniques } from '../tutorial/asked.ts'
import { ChoiceCard, TUTORIAL_OFFER, techniquesOffer } from '../tutorial/ChoiceCard.tsx'
import { useLessonsDone } from '../tutorial/done.ts'
import { HowToPlay } from '../tutorial/HowToPlay.tsx'
import { TRACKS } from '../tutorial/tracks.ts'
import { AssistsDisclosure, ControlsDisclosure } from './AssistsDisclosure.tsx'
import { AssistSwitches } from './AssistSwitches.tsx'
import { Board, REVEAL_MS } from './Board.tsx'
import { ClearButton, LoopIcon } from './ClearButton.tsx'
import { ClockPill, PauseVeil, TimeCard } from './ClockPill.tsx'
import { ColClues, RowClues } from './Clues.tsx'
import { ControlsLegend } from './ControlsLegend.tsx'
import { Dock } from './Dock.tsx'
import { useBoardGestures } from './gestures.ts'
import { HintButton } from './HintButton.tsx'
import { HintTag } from './HintTag.tsx'
import { RAIL_WIDTH, boardTracks, fitCellSize, useRail } from './layout.ts'
import { createLineHints } from './line-hints.ts'
import { Minimap } from './Minimap.tsx'
import { encodeCells } from './progress-storage.ts'
import { Filmstrip, PageHead, SlotRow } from './Filmstrip.tsx'
import { type Pose, celebrate, popOnly } from './sticker-moment.ts'
import { type PlayState, PlayStore, crosshairOf, freshCells } from './store.ts'
import { RailStamps } from './RailStamps.tsx'
import { RailTools } from './RailTools.tsx'
import { useRailFold } from './useRailFold.ts'
import { useUndoKeys } from './useUndoKeys.ts'
import { BoardView, fitView } from './viewport.ts'
import styles from './Play.module.css'

const route = getRouteApi('/play/$id')

export function PlayPage() {
  const { puzzle, campaign } = route.useLoaderData()
  const previewConquest = route.useSearch().conquest === true
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
  const index = campaign.provinces.indexOf(province)
  const number = province.puzzles.findIndex(p => p.id === puzzle.id) + 1
  return (
    <Play
      key={`${account.generation}:${puzzle.id}`}
      puzzle={puzzle}
      account={account}
      context={{
        place: province.name,
        paper: paperFor(province.paper),
        back: `/c/${campaign.id}/${province.id}`,
        here: `/play/${puzzle.id}`,
        meta: [puzzle.tier && TIER_NAME[puzzle.tier], `${puzzle.width}×${puzzle.height}`].filter(Boolean).join(' · '),
        campaign,
        album: { campaign, province, index, number, previewConquest },
      }}
    />
  )
}

/**
 * Where the puzzle belongs, for everything around the board. A campaign puzzle's `album` is its Province:
 * the slots, gold slot, onward link, conquest and Techniques offer. A Daily has none of those.
 */
export interface PlayContext {
  /** Whose page the sticker goes on: the Province's or the Month's name. */
  place: string
  paper: CSSProperties
  /** That page, for the way back and for B once solved. */
  back: string
  /** This puzzle's own path, for Learn to hand back to. */
  here: string
  meta: string
  /** Beside the meta while it's unsolved: how long is left to finish a Daily. */
  chip?: ReactNode
  /** For How to play's New tag. */
  campaign?: Campaign
  album?: AlbumPlace
}

interface AlbumPlace {
  campaign: Campaign
  province: Province
  index: number
  /** 1-based on the province's pages. */
  number: number
  /** Dev only: the after panel as if this solve had just conquered the province. */
  previewConquest: boolean
}

function useStoreValue<T>(store: PlayStore, select: (s: PlayState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()))
}

/**
 * A solve played in this visit. `waiting` holds for the reveal, `banner` slams the banner in and hands its
 * sticker on to the slot, and then it has `landed`. A replay's re-solve only `popping`s, then the sticker is
 * `kept`. The `?conquest` preview plays the banner with no sticker.
 */
type Moment = 'waiting' | 'banner' | 'landed' | 'popping' | 'kept'

const slantAngle = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--slant-angle'))

const centerOf = (el: Element) => {
  const r = el.getBoundingClientRect()
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

export function Play({
  puzzle,
  context,
  account: { storage, sync },
}: {
  puzzle: PuzzleClues
  context: PlayContext
  account: AccountState
}) {
  const { album, paper } = context
  const isConquered = () =>
    album !== undefined && campaignProgress(album.campaign, storage).provinces[album.index]!.state === 'conquered'
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
  const previewConquest = album?.previewConquest === true
  const conquest = previewConquest || (solved && !conqueredBefore && isConquered())
  const next =
    solved && album ? nextPuzzle(album.province.puzzles, puzzle.id, id => storage.loadSolved(id) !== null) : null
  const replaying = useStoreValue(store, s => s.replaying)
  const unverified = !solved && storage.loadSolved(puzzle.id) === 'unverified'
  const [firstSolve] = useState(() => storage.loadSolved(puzzle.id) === null)
  const hint = useStoreValue(store, s => s.hint)
  const hinted = useStoreValue(store, s => s.hinted)
  const [hintFailed, setHintFailed] = useState(false)
  const palette = useStoreValue(store, s => s.palette)
  const stamps = useStoreValue(store, s => s.stamps)
  const cells = useStoreValue(store, s => s.cells)
  const percent = useMemo(() => progressPercent(cells, puzzle.filledCount, false), [cells, puzzle.filledCount])
  const settings = useSettings()
  const offerTutorial = useShouldOffer(storage)
  const offerTechniques = useShouldOfferTechniques(album?.province, useLessonsDone()) && !offerTutorial
  const fresh = useMemo(() => freshCells(puzzle, settings.autoMarkEmptyLines), [puzzle, settings.autoMarkEmptyLines])
  const canClear = useMemo(() => cells.some((c, i) => c !== fresh[i]), [cells, fresh])
  const crossRow = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.row ?? null) : null))
  const crossCol = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.col ?? null) : null))
  const paused = useStoreValue(store, s => s.paused && !s.solved)

  const [lineHints] = useState(() => createLineHints(puzzle))
  const hints = useMemo(() => lineHints(cells), [lineHints, cells])
  const { fadeClues, impossibleLines } = settings
  const assists = useMemo(() => ({ fade: fadeClues, impossible: impossibleLines }), [fadeClues, impossibleLines])

  const stageRef = useRef<HTMLDivElement>(null)
  const [cellSize, setCellSize] = useState(0)
  // Fitted at once as well, so the board is there for a morph to capture before the observer first reports.
  useLayoutEffect(() => {
    const stage = stageRef.current!
    setCellSize(fitCellSize(stage.getBoundingClientRect(), puzzle))
    const observer = new ResizeObserver(([entry]) => setCellSize(fitCellSize(entry!.contentRect, puzzle)))
    observer.observe(stage)
    return () => observer.disconnect()
  }, [puzzle])
  const wide = useRail()

  useUndoKeys(store)

  // Capture, so the clock is stored before the account's own listeners flush the sync.
  useEffect(() => {
    const onVisibility = () => (document.visibilityState === 'hidden' ? store.suspend() : store.wake())
    const onHide = () => store.suspend()
    document.addEventListener('visibilitychange', onVisibility, true)
    window.addEventListener('pagehide', onHide, true)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility, true)
      window.removeEventListener('pagehide', onHide, true)
      store.suspend()
    }
  }, [store])

  // The local check already won; the server only supplies the reveal colors, so a failure just
  // sends the sticker off without them. A Replay that sets a new best still tells an account's server.
  const [revealFailed, setRevealFailed] = useState(false)
  useEffect(() => {
    if (!solved) return
    const { palette, cells, solveMs, bestMs, attemptHinted } = store.getState()
    const newBest = solveMs !== null && solveMs === bestMs && !attemptHinted && storage.userId !== null
    if (palette && !newBest) return
    const body: SolveRequest = {
      cells: cells.map(c => (c === 'filled' ? 'filled' : 'empty')),
      ...(solveMs !== null && { ms: Math.round(solveMs), hinted: attemptHinted }),
    }
    // Only the best left to send: never aborted, and on failure it stays on this device.
    if (palette) return void submitSolve(puzzle.id, body).catch(() => {})
    const abort = new AbortController()
    submitSolve(puzzle.id, body, abort.signal).then(
      res => (res.solved ? store.setPalette(res.palette, res.foil, res.crest, res.stamps) : setRevealFailed(true)),
      () => !abort.signal.aborted && setRevealFailed(true),
    )
    return () => abort.abort()
  }, [solved, store, puzzle.id, storage])

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

  const [moment, setMoment] = useState<Moment | null>(() => (previewConquest && !reducedMotion() ? 'banner' : null))
  const before = useRef({ solved, replaying })
  useLayoutEffect(() => {
    const prev = before.current
    before.current = { solved, replaying }
    if (!solved) {
      if (prev.solved) setMoment(null)
    } else if (!prev.solved) {
      if (!prev.replaying) setMoment('waiting')
      else if (!reducedMotion()) setMoment('popping')
      else {
        play('pop')
        setMoment('kept')
      }
    }
  }, [solved, replaying])

  // Read at each render: the first solve settles it, and an account's server answer can overrule the device.
  const foil = storage.loadFoil(puzzle.id)
  const gold = album?.number === GOLD_SLOT
  const kind = conquest || gold ? 'gold' : foil ? 'foil' : 'plain'
  const cheer = () => {
    play(conquest ? 'chime' : 'thunk')
    rumble(conquest ? 'conquest' : 'solve')
  }

  useEffect(() => {
    if (moment !== 'waiting' || fitting || !(palette || revealFailed)) return
    if (reducedMotion()) {
      cheer()
      return setMoment('landed')
    }
    const timer = setTimeout(() => setMoment('banner'), palette ? REVEAL_MS : 0)
    return () => clearTimeout(timer)
  }, [moment, fitting, palette, revealFailed])

  const shellRef = useRef<HTMLElement>(null)
  const bandRef = useRef<HTMLDivElement>(null)
  const bandStickerRef = useRef<HTMLSpanElement>(null)
  const floatRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLElement | null>(null)
  const setSlot = (el: HTMLElement | null) => {
    slotRef.current = el
  }
  useLayoutEffect(() => {
    if (moment !== 'banner') return
    const angle = -slantAngle()
    const tilt = tiltOf(puzzle.id)
    const float = floatRef.current
    const sticker = bandStickerRef.current
    const slot = slotRef.current
    const choreography = celebrate({
      band: bandRef.current!,
      angle,
      shake: kind === 'plain' ? null : shellRef.current,
      onLand: cheer,
      handOff:
        float && slot
          ? {
              float,
              from:
                wide && sticker
                  ? {
                      sticker,
                      pose: (): Pose => {
                        const face = sticker.firstElementChild as HTMLElement
                        return { ...centerOf(face), width: face.offsetWidth, angle: angle + tilt }
                      },
                    }
                  : undefined,
              // The slot's sticker fills its square inner box, narrowed for a tall picture.
              to: (): Pose => {
                const box = slot.firstElementChild ?? slot
                return { ...centerOf(box), width: box.clientWidth * Math.min(1, puzzle.width / puzzle.height), angle: tilt }
              },
            }
          : undefined,
    })
    choreography.finished.then(
      () => setMoment('landed'),
      () => {},
    )
    return choreography.cancel
  }, [moment])

  useLayoutEffect(() => {
    if (moment !== 'popping' || fitting) return
    const board = stageRef.current!.querySelector(`.${styles.board} > canvas`)!.getBoundingClientRect()
    const choreography = popOnly(floatRef.current!, board)
    choreography.finished.then(
      () => setMoment('kept'),
      () => {},
    )
    return choreography.cancel
  }, [moment, fitting])

  const dockRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const railBodyRef = useRef<HTMLDivElement>(null)

  const hideSticker = moment === 'waiting' || moment === 'banner'
  const done = previewConquest || (solved && !hideSticker)
  // Up before the flight, once the fit glide is over, so the sticker has a slot to fly to.
  const afterOpen = !wide && (done || (hideSticker && !fitting))
  const fold = useRailFold(panelRef, railBodyRef, wide && !done)

  usePadPage({
    parent: solved ? context.back : undefined,
    panel: () => {
      if (!wide) return dockRef.current?.querySelector<HTMLElement>('[data-pad-menu]') ?? null
      const panel = panelRef.current
      return panel && (panel.querySelector<HTMLElement>(`.${styles.hintCard} > button`) ?? firstFocusable(panel))
    },
    hold: hideSticker || moment === 'popping',
  })
  // The solve hands a controller on from the board to the onward link once it shows.
  useEffect(() => {
    if (!done || !getPadMode()) return
    const active = document.activeElement
    if (active === document.body || stageRef.current?.contains(active)) focusDefault()
  }, [done])
  const left = album?.province.puzzles.filter(p => storage.loadSolved(p.id) === null).length ?? 0
  const title = album ? `#${album.number} ${puzzle.title}` : puzzle.title
  const art = palette ?? Array<null>(puzzle.width * puzzle.height).fill(null)
  const sticker = (tilt = 0) => (
    <Sticker
      title={puzzle.title}
      width={puzzle.width}
      height={puzzle.height}
      palette={art}
      foil={foil}
      gold={gold}
      tilt={tilt}
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
      Foil sticker!
    </Dymo>
  ) : (
    unverified && <Dymo className={styles.tag}>Imported: replay to verify</Dymo>
  )

  const stakes = replaying ? (
    <Stakes title="Already in the album">Replays never change the sticker.</Stakes>
  ) : !firstSolve ? null : hinted ? (
    <Stakes swatch="plain" title="Regular sticker">
      A hint was used on this one.
    </Stakes>
  ) : (
    <Stakes swatch="foil" title="Foil still possible">
      A hint makes it a regular sticker.
    </Stakes>
  )
  const hintButton = (popover: boolean) => (
    <HintButton
      store={store}
      confirmFirst={firstSolve && !hinted}
      popover={popover}
      stakes={popover ? undefined : stakes}
      note={
        !popover &&
        hintFailed && (
          <p className={styles.panelNote} role="status">
            {HINT_FAILED}
          </p>
        )
      }
      request={cells => requestHint(puzzle.id, { cells: encodeCells(cells) })}
      onError={setHintFailed}
    />
  )

  const controls = { lines: true, zoom: true, back: 'Back to page' }

  const following = album?.campaign.provinces[album.index + 1]
  const tally = album ? ` ${left === 0 ? 'Page complete.' : `${left} to go.`}` : ''
  const message =
    conquest && album ? (
      <p role="status">
        <b>{album.province.name} conquered.</b>
        {album.province.flavour && <span className={styles.flavour}>{album.province.flavour}</span>}
      </p>
    ) : (
      <p role="status">
        {moment === 'landed'
          ? `${puzzle.title} is in ${context.place}.${tally}`
          : moment === 'kept'
            ? `Solved again. ${puzzle.title} stays where it is.`
            : `${puzzle.title} is in the album.`}
      </p>
    )
  const closing = conquest && album && !following && (
    <p className={styles.closing}>{album.campaign.closingLine || `${album.campaign.name} is yours.`}</p>
  )
  // `named` for the after sheet; the rail's Next up already names the puzzle.
  const onward = (named: boolean) => !album ? null : !conquest ? (
    next && (
      <Link to="/play/$id" params={{ id: next.id }} data-variant="primary" data-pad-default>
        Next
        {named && (
          <small>
            #{album.province.puzzles.indexOf(next) + 1} {next.title}
          </small>
        )}
        <ArrowIcon />
        <PadGlyph button="A" />
      </Link>
    )
  ) : following ? (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId: album.campaign.id, provinceId: following.id }}
      className={styles.into}
      style={paperFor(following.paper)}
      data-variant="primary"
      data-pad-default
    >
      Into {following.name.replace(/^The /, 'the ')}
      <ArrowIcon />
      <PadGlyph button="A" />
    </Link>
  ) : (
    <Link
      to="/c/$campaignId/$provinceId"
      params={{ campaignId: album.campaign.id, provinceId: album.campaign.provinces.at(-1)!.id }}
      data-variant="primary"
      data-pad-default
    >
      To {album.campaign.provinces.at(-1)!.name.replace(/^The /, 'the ')}
      <PadGlyph button="A" />
    </Link>
  )
  const onwardless = !album || (!conquest && !next)
  const backToPage = (
    <Link to={context.back} data-variant="paper" data-pad-default={onwardless || undefined}>
      {context.place}
      <PadGlyph button="B" />
    </Link>
  )
  const replay = <ClearButton store={store} solved />
  const actions = (
    <div className={styles.btnRow}>
      <HowToPlay back={context.here} campaign={context.campaign} className={styles.howTo} />
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
  const slotRow = album && { province: album.province, number: album.number, storage, hideSticker }

  const afterBody = (
    <>
      {conquest && album ? (
        following ? (
          <CountPill conquered className={styles.conquestPill}>
            {album.province.puzzles.length}/{album.province.puzzles.length}
          </CountPill>
        ) : (
          <CountPill tone="gold" className={styles.conquestPill}>
            Album complete
          </CountPill>
        )
      ) : (
        tag
      )}
      {message}
      <TimeCard store={store} />
      {closing}
      {onward(true)}
      <div className={styles.panelActions}>
        {replay}
        {backToPage}
      </div>
    </>
  )

  // Solved, the rail's % pill gives way to what the solve earned; a conquest's stamp will say it instead.
  const outcome = conquest ? null : moment === 'kept' ? (
    <Dymo tone="pink" className={styles.tag}>
      Sticker kept
    </Dymo>
  ) : foil ? (
    <Dymo tone="pink" className={styles.tag}>
      Foil sticker!
    </Dymo>
  ) : (
    <Dymo className={styles.tag}>Solved</Dymo>
  )
  const solvedNote =
    conquest && album ? (
      <>
        {album.province.flavour && <p className={`${styles.railNote} ${styles.flavour}`}>{album.province.flavour}</p>}
        {closing}
      </>
    ) : (
      moment === 'kept' && <p className={styles.railNote}>Solved again. Replays never change the sticker.</p>
    )

  const { meta } = context
  const chip = !solved && context.chip
  const backLink = (className: string | undefined) => (
    <Link to={context.back} className={className} aria-label={`Back to ${context.place}`}>
      ← <span>{context.place}</span>
    </Link>
  )
  const offer = offerTutorial ? (
    <ChoiceCard track={TRACKS.tutorial} copy={TUTORIAL_OFFER} back={context.here} />
  ) : (
    offerTechniques &&
    album && <ChoiceCard track={TRACKS.techniques} copy={techniquesOffer(album.province)} back={context.here} />
  )

  const paperMorph = columnPaper(album ? `province-${album.province.id}` : undefined)
  const surfaceMorph = boardMorph('surface', 'surface')
  const railMorph = boardMorph('rail', 'rail')
  const boardName = boardMorph(slotName(puzzle.id))

  // One tree for both layouts: the strip, rail and top line sit in fixed child positions around the
  // surface, so switching between them never remounts the surface or the board.
  return (
    <main
      ref={shellRef}
      className={styles.shell}
      data-rail={wide || undefined}
      {...paperMorph}
      style={{ ...paper, ...paperMorph.style }}
    >
      {!wide && (
        <header className={styles.topLine}>
          {backLink(styles.topBack)}
          <h1 className={styles.topTitle}>{title}</h1>
          <span className={styles.topMeta}>{meta}</span>
          {chip}
          {!solved && <span className={styles.topPercent}>{percent}%</span>}
          {!done && tag}
          <span className={styles.topTools}>
            <SoundButton className={styles.round} variant="flat" size="compact" />
            <ThemeButton className={styles.round} variant="flat" size="compact" />
          </span>
        </header>
      )}
      {wide && <FloatingPills />}
      <div className={styles.shellBody}>
        {wide && slotRow && <Filmstrip {...slotRow} slotRef={setSlot} glow={solved && moment === 'landed'} />}
        <div className={styles.surface} data-paused={paused || undefined} {...surfaceMorph}>
          <div ref={stageRef} className={styles.stage}>
            {cellSize > 0 && (
              <div
                ref={boardRef}
                className={styles.board}
                data-revealed={palette !== null || undefined}
                {...boardName}
                style={{ ...boardTracks(puzzle, cellSize), ...boardName.style }}
              >
                <Minimap store={store} view={boardView} cellSize={cellSize} />
                <ColClues lines={puzzle.clues.cols} hints={hints.cols} active={crossCol} assists={assists} />
                <RowClues lines={puzzle.clues.rows} hints={hints.rows} active={crossRow} assists={assists} />
                <Board store={store} cellSize={cellSize} view={boardView} />
                {hint && <HintTag hint={hint} cells={cells} view={boardView} />}
              </div>
            )}
          </div>
          {paused && <PauseVeil store={store} />}
          {!wide && !solved && (
            <div className={styles.clockCorner}>
              <ClockPill store={store} />
            </div>
          )}
          {offer}
        </div>
        {wide && (
          <aside
            ref={panelRef}
            className={`${styles.rail} ${styles.underPills}`}
            {...railMorph}
            style={{ ...railMorph.style, width: RAIL_WIDTH }}
            data-pad-panel
            aria-label={puzzle.title}
          >
            <div className={styles.railHead}>
              <Link
                to={context.back}
                className={styles.railBack}
                data-variant="paper"
                data-pad-default={(done && onwardless) || undefined}
                aria-label={`Back to ${context.place}`}
              >
                ← {context.place}
                {solved && <PadGlyph button="B" />}
              </Link>
              <p className={styles.railKicker}>{meta}</p>
              <h1 className={styles.railName}>{puzzle.title}</h1>
              <div className={styles.railBadges} role={done ? 'status' : undefined}>
                {done ? (
                  outcome
                ) : (
                  <>
                    {!solved && <CountPill className={styles.railPercent}>{percent}%</CountPill>}
                    {chip}
                    {!solved && <ClockPill store={store} />}
                    {tag}
                  </>
                )}
              </div>
              {done && solvedNote}
              {done && <TimeCard store={store} />}
            </div>
            {done ? (
              <div className={styles.railBody}>
                {stamps && <RailStamps stamps={stamps} campaign={album?.campaign} regular={!foil} />}
                <div className={styles.railFoot}>
                  {album && !conquest && next && (
                    <NextUp puzzle={next} number={album.province.puzzles.indexOf(next) + 1} storage={storage} />
                  )}
                  {onward(false)}
                  {replay}
                </div>
              </div>
            ) : (
              <div ref={railBodyRef} className={styles.railBody} inert={solved}>
                <RailTools store={store} />
                {hintButton(false)}
                {fold < 2 && (
                  <section className={styles.railSection} aria-labelledby="rail-controls">
                    <h2 id="rail-controls">Controls</h2>
                    <ControlsLegend />
                  </section>
                )}
                {fold < 1 && (
                  <section className={styles.railSection} aria-labelledby="rail-assists">
                    <h2 id="rail-assists">Assists</h2>
                    <AssistSwitches />
                  </section>
                )}
                <div className={styles.railFoot}>
                  {fold > 0 && (
                    <div className={styles.railFolds}>
                      {fold > 1 && <ControlsDisclosure store={store} />}
                      <AssistsDisclosure store={store} />
                    </div>
                  )}
                  {actions}
                </div>
              </div>
            )}
            {!done && <PanelTag />}
          </aside>
        )}
      </div>
      {!wide && (
        <Dock
          ref={dockRef}
          store={store}
          solved={solved}
          hint={hintButton(true)}
          paper={paper}
          page={
            <>
              {slotRow && (
                <>
                  <PageHead {...slotRow} />
                  <SlotRow {...slotRow} />
                </>
              )}
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
        <div className={`${styles.sheet} ${styles.afterSheet}`} style={paper}>
          <div className={styles.sheetFace}>
            {slotRow && <SlotRow {...slotRow} slotRef={setSlot} />}
            {/* Laid out but unseen until the sticker lands, so the slot row can't shift under its flight. */}
            <div className={styles.panelAfter} data-pending={!done || undefined}>
              {afterBody}
            </div>
          </div>
        </div>
      )}
      {moment === 'banner' && (
        <div className={styles.banner} aria-hidden="true">
          <div ref={bandRef} className={styles.band} data-kind={kind} data-conquest={conquest || undefined}>
            {solved && (
              <span ref={bandStickerRef} className={styles.bandSticker}>
                {sticker(tiltOf(puzzle.id))}
              </span>
            )}
            <span>
              <span className={styles.bandKick}>
                {conquest && album ? (
                  <>
                    <CheckIcon /> {album.province.puzzles.length} / {album.province.puzzles.length} · Province{' '}
                    {album.index + 1}
                  </>
                ) : (
                  [album ? 'Stage clear' : 'Daily clear', foil && 'Foil', gold && 'Gold'].filter(Boolean).join(' · ')
                )}
              </span>
              <span className={styles.bandTitle}>{conquest && album ? `${album.province.name} is yours` : title}</span>
            </span>
          </div>
        </div>
      )}
      {((moment === 'banner' && solved) || (moment === 'popping' && !fitting)) && (
        <div ref={floatRef} className={styles.float} aria-hidden="true">
          {sticker()}
        </div>
      )}
    </main>
  )
}

export const TIER_NAME: Record<Tier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' }

const HINT_FAILED = "Couldn't reach the album for a hint. Try again in a moment."

/** What a hint would cost, under Hint in the rail. */
function Stakes({ swatch, title, children }: { swatch?: 'foil' | 'plain'; title: string; children: string }) {
  return (
    <div className={styles.stakes} data-swatch={swatch}>
      {swatch && <i aria-hidden="true" />}
      <p>
        <b>{title}</b>
        {children}
      </p>
    </div>
  )
}
