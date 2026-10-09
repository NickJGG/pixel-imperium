import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { Campaign, Province, PuzzleClues } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { Slot } from '../album/Slot.tsx'
import { paperStyle } from '../album/paper.ts'
import { Stamp } from '../album/Stamp.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { type AccountState, useAccount } from '../account.ts'
import { requestHint, submitSolve } from '../api.ts'
import { campaignProgress, isOpen, nextPuzzle } from '../campaign/progress.ts'
import { LockedProvince } from '../campaign/ProvincePage.tsx'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { getPadMode } from '../pad/mode.ts'
import { usePadPage } from '../pad/PadProvider.tsx'
import { rumble } from '../pad/rumble.ts'
import { firstFocusable, focusDefault } from '../pad/spatial.ts'
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
import { useBoardGestures } from './gestures.ts'
import { HintButton, hintText } from './HintButton.tsx'
import { PILL_BAND, SIDE_PAGE_GAP, SIDE_PAGE_WIDTH, boardTracks, fitPlay } from './layout.ts'
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
  const crumbRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLElement>(null)
  const statusRef = useRef<HTMLParagraphElement>(null)
  const sidePageShown = useRef(false)
  const settledRef = useRef(false)
  const fitHeight = useRef(0)
  const [fit, setFit] = useState<{ cellSize: number; sidePage: boolean } | null>(null)
  useLayoutEffect(() => {
    // The fit is always made against the stage wide gives: the panel's width goes back on while it
    // shows, and compact's crumb, card head and status line go back on while they show.
    // Otherwise each layout's room could pick the other one, and the two would flip forever.
    const compactChrome = () =>
      [crumbRef, headRef, statusRef].reduce((sum, { current: el }) => {
        if (!el) return sum
        return sum + el.getBoundingClientRect().height + parseFloat(getComputedStyle(el.parentElement!).rowGap)
      }, 0)
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      const room = sidePageShown.current ? SIDE_PAGE_WIDTH + SIDE_PAGE_GAP : 0
      // Settled, the card shrinks to the board, so its height would only shrink the board with it.
      if (!settledRef.current) fitHeight.current = height + compactChrome()
      const next = fitPlay({ width: width + room, height: fitHeight.current }, puzzle)
      sidePageShown.current = next.sidePage
      setFit(next)
    })
    observer.observe(stageRef.current!)
    return () => observer.disconnect()
  }, [puzzle])
  const cellSize = fit?.cellSize ?? 0
  const wide = fit?.sidePage ?? false

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
    if (moment === 'flying') {
      const slot = slotRef.current!.getBoundingClientRect()
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

  const cardRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (moment !== 'landed') return
    play(conquest ? 'chime' : 'thunk')
    rumble(conquest ? 'conquest' : 'solve')
    if (reducedMotion()) return
    return confetti((panelRef.current ?? cardRef.current)!, styles.burst!)
  }, [moment, conquest])

  const hideSticker = moment === 'waiting' || moment === 'flying'
  const done = previewConquest || (solved && !hideSticker)

  usePadPage({
    parent: solved ? `/c/${campaign.id}/${province.id}` : undefined,
    panel: () => {
      if (!wide) return cardRef.current?.querySelector<HTMLElement>('[data-pad-menu]') ?? null
      const panel = panelRef.current
      return panel && (panel.querySelector<HTMLElement>(`.${styles.panelHint} button`) ?? firstFocusable(panel))
    },
    menu: wide && !solved ? () => panelRef.current?.querySelector<HTMLElement>('[role="switch"]')?.focus() : undefined,
    hold: solved && moment !== 'landed' && moment !== 'kept',
  })
  // The solve hands a controller on from the board to the onward link once it shows.
  useEffect(() => {
    if (!done || !getPadMode()) return
    const active = document.activeElement
    if (active === document.body || stageRef.current?.contains(active)) focusDefault()
  }, [done])
  // Compact after a solve: the pill leaves, the card shrinks to the board and the after card stacks below.
  const settled = solved && done && !wide && fit !== null
  useLayoutEffect(() => {
    settledRef.current = settled
  }, [settled])
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
    </Link>
  ) : (
    <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} className={styles.linkButton} data-pad-default>
      Back to the cover
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

  const stage = (
    <div className={styles.stageWrap}>
      <div
        ref={stageRef}
        className={`${styles.stage} ${styles.playStage}`}
        style={{ '--pill-band': `${PILL_BAND}px` } as CSSProperties}
      >
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
      {!solved && (
        <ToolPill store={store} compact={!wide}>
          {!wide && hintButton(true)}
        </ToolPill>
      )}
    </div>
  )

  // One tree for both layouts, so switching between them never remounts the stage or the board.
  return (
    <main className={settled ? `${styles.play} ${styles.settled}` : styles.play}>
      {!wide && (
        <div ref={crumbRef} className={styles.crumb}>
          <Link to="/c/$campaignId/$provinceId" params={{ campaignId: campaign.id, provinceId: province.id }}>
            ← {province.name}
          </Link>
        </div>
      )}
      <div className={styles.desk} style={{ gap: SIDE_PAGE_GAP }}>
        <div ref={cardRef} className={styles.card}>
          {!wide && (
            <header ref={headRef} className={styles.cardHead}>
              <span ref={setSlot} className={styles.slotChip} aria-label={`Slot ${number}`}>
                {solved && !hideSticker ? (
                  <Slot number={number} width={puzzle.width} height={puzzle.height}>
                    {sticker}
                  </Slot>
                ) : (
                  <Slot number={number} width={puzzle.width} height={puzzle.height} gold={number === GOLD_SLOT} next />
                )}
              </span>
              <h1 className={styles.title}>
                #{number} {puzzle.title}
              </h1>
              {!solved && percent > 0 && <span className={styles.percent}>{percent}%</span>}
              <div className={styles.headEnd}>
                {tag}
                {!solved && (
                  <MoreMenu store={store} paper={paperStyle(provinceIndex)}>
                    <SlotRow province={province} number={number} storage={storage} hideSticker={hideSticker} />
                    <AssistSwitches />
                    <div className={styles.panelFoot}>
                      {learn}
                      <ClearButton store={store} solved={false} disabled={!canClear} />
                    </div>
                  </MoreMenu>
                )}
              </div>
            </header>
          )}
          {!wide && !done && (
            // Kept through the fly-in so the board doesn't move under the sticker.
            <p ref={statusRef} className={styles.hintLine} role="status">
              {hint ? (
                <Dymo tone="pink">{hintText(hint, cells, puzzle.width)}</Dymo>
              ) : hintFailed ? (
                "Couldn't reach the album for a hint. Try again in a moment."
              ) : (
                firstSolve && (
                  <span className={styles.foilNote} data-lost={hinted || undefined}>
                    <i aria-hidden="true" />
                    {hinted ? 'Hint used: regular sticker' : 'Foil still possible'}
                  </span>
                )
              )}
            </p>
          )}
          {stage}
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
            tag={!done && tag}
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
          </PuzzlePanel>
        )}
      </div>
      {!wide && done && (
        <div className={`${styles.panelAfter} ${styles.afterCard}`}>
          {conquest && conquestStamp(styles.afterStamp)}
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
