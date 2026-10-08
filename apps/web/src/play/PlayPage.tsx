import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
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
import { getSettings, useSettings } from '../settings.ts'
import { play } from '../sound.ts'
import { useShouldOffer } from '../tutorial/asked.ts'
import { ChoiceCard } from '../tutorial/ChoiceCard.tsx'
import { HowToPlay } from '../tutorial/HowToPlay.tsx'
import { AssistChips } from './AssistChips.tsx'
import { AssistSwitches } from './AssistSwitches.tsx'
import { Board, REVEAL_MS } from './Board.tsx'
import { ClearButton, LoopIcon } from './ClearButton.tsx'
import { ColClues, RowClues } from './Clues.tsx'
import { HintButton, hintText } from './HintButton.tsx'
import { CLUE_SLOT, PILL_BAND, SIDE_PAGE_GAP, SIDE_PAGE_WIDTH, fitPlay } from './layout.ts'
import { createLineHints } from './line-hints.ts'
import { encodeCells } from './progress-storage.ts'
import { PuzzlePanel } from './PuzzlePanel.tsx'
import { type Choreography, confetti, flyIn, popOnly } from './sticker-moment.ts'
import { type PlayState, PlayStore, crosshairOf, freshCells } from './store.ts'
import { ToolPill } from './ToolPill.tsx'
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
  const belowRef = useRef<HTMLDivElement>(null)
  const sidePageShown = useRef(false)
  const [fit, setFit] = useState<{ cellSize: number; sidePage: boolean } | null>(null)
  useLayoutEffect(() => {
    // The fit is always made against the stage wide gives: the panel's width goes back on while it
    // shows, and compact's crumb, card head and under-board stack go back on while they show.
    // Otherwise each layout's room could pick the other one, and the two would flip forever.
    const compactChrome = () =>
      [crumbRef, headRef, belowRef].reduce((sum, { current: el }) => {
        if (!el) return sum
        return sum + el.getBoundingClientRect().height + parseFloat(getComputedStyle(el.parentElement!).rowGap)
      }, 0)
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      const room = sidePageShown.current ? SIDE_PAGE_WIDTH + SIDE_PAGE_GAP : 0
      const next = fitPlay({ width: width + room, height: height + compactChrome() }, puzzle)
      sidePageShown.current = next.sidePage
      setFit(next)
    })
    observer.observe(stageRef.current!)
    return () => observer.disconnect()
  }, [puzzle])
  const cellSize = fit?.cellSize ?? 0
  const wide = fit?.sidePage ?? false

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key === 'z' && !e.shiftKey) store.undo()
      else if (key === 'z' || key === 'y') store.redo()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])

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
    if (moment !== 'waiting' || !(palette || revealFailed)) return
    if (reducedMotion()) return setMoment('landed')
    const timer = setTimeout(() => setMoment('flying'), palette ? REVEAL_MS : 0)
    return () => clearTimeout(timer)
  }, [moment, palette, revealFailed])

  const boardRef = useRef<HTMLDivElement>(null)
  const floatRef = useRef<HTMLDivElement>(null)
  const slotRef = useRef<HTMLElement | null>(null)
  const setSlot = (el: HTMLElement | null) => {
    slotRef.current = el
  }
  useLayoutEffect(() => {
    if (moment !== 'flying' && moment !== 'popping') return
    const float = floatRef.current!
    const board = boardRef.current!.querySelector('canvas')!.getBoundingClientRect()
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
  }, [moment, puzzle.id])

  const cardRef = useRef<HTMLDivElement>(null)
  const sidePageRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (moment !== 'landed') return
    play(conquest ? 'chime' : 'thunk')
    if (reducedMotion()) return
    return confetti((sidePageRef.current ?? cardRef.current)!, styles.burst!)
  }, [moment, conquest])

  const hideSticker = moment === 'waiting' || moment === 'flying'
  const done = previewConquest || (solved && !hideSticker)
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

  const hintButton = (
    <HintButton
      store={store}
      confirmFirst={firstSolve && !hinted}
      request={cells => requestHint(puzzle.id, { cells: encodeCells(cells) })}
      onError={setHintFailed}
    />
  )

  const after = (
    <div className={styles.after}>
      {conquest ? (
        <Conquest campaign={campaign} province={province}>
          <ClearButton store={store} solved />
        </Conquest>
      ) : (
        <>
          <p role="status">
            {moment === 'landed'
              ? `${puzzle.title} is in ${province.name}. ${left === 0 ? 'Page complete.' : `${left} to go.`}`
              : moment === 'kept'
                ? `Solved again. ${puzzle.title} stays where it is.`
                : `${puzzle.title} is in the album.`}
          </p>
          <div className={styles.afterActions}>
            <Link
              to="/c/$campaignId/$provinceId"
              params={{ campaignId: campaign.id, provinceId: province.id }}
              className={`${styles.linkButton} ${styles.paper}`}
            >
              Back to page
            </Link>
            <ClearButton store={store} solved />
            {next && (
              <Link to="/play/$id" params={{ id: next.id }} className={styles.linkButton}>
                Next: {next.title}
                <ArrowIcon />
              </Link>
            )}
          </div>
        </>
      )}
    </div>
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
            style={
              {
                '--cell': `${cellSize}px`,
                '--clue-slot': `${cellSize * CLUE_SLOT}px`,
              } as CSSProperties
            }
          >
            <div />
            <ColClues lines={puzzle.clues.cols} hints={hints.cols} active={crossCol} assists={assists} />
            <RowClues lines={puzzle.clues.rows} hints={hints.rows} active={crossRow} assists={assists} />
            <Board store={store} cellSize={cellSize} />
          </div>
        )}
      </div>
      {!done && <ToolPill store={store} inert={solved} />}
    </div>
  )

  // One tree for both layouts, so switching between them never remounts the stage or the board.
  return (
    <main className={styles.play}>
      {!wide && (
        <div ref={crumbRef} className={styles.crumb}>
          <Link to="/c/$campaignId/$provinceId" params={{ campaignId: campaign.id, provinceId: province.id }}>
            ← {province.name}
          </Link>
          {tag}
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
              <span className={styles.size}>
                {puzzle.width}×{puzzle.height}
              </span>
              {!solved && percent > 0 && <span className={styles.percent}>{percent}%</span>}
            </header>
          )}
          {stage}
          {done ? (
            <div ref={wide ? undefined : belowRef}>{after}</div>
          ) : (
            !wide && (
              // Kept through the fly-in so the board doesn't resize under the sticker.
              <div ref={belowRef} className={styles.tools} inert={solved}>
                {hint ? (
                  <p className={styles.hintLine} role="status">
                    <Dymo tone="pink">{hintText(hint, cells, puzzle.width)}</Dymo>
                  </p>
                ) : hintFailed ? (
                  <p className={styles.hintLine} role="status">
                    Couldn't reach the album for a hint. Try again in a moment.
                  </p>
                ) : (
                  firstSolve && (
                    <p className={styles.hintLine}>
                      <span className={styles.foilNote} data-lost={hinted || undefined}>
                        <i aria-hidden="true" />
                        {hinted ? 'Hint used: regular sticker' : 'No hints yet: this one will be foil'}
                      </span>
                    </p>
                  )
                )}
                <div className={styles.dock}>
                  <ClearButton store={store} solved={false} disabled={!canClear} />
                  {hintButton}
                </div>
                <AssistChips />
                <HowToPlay back={`/play/${puzzle.id}`} className={styles.howTo} />
              </div>
            )
          )}
          {moment === 'landed' && !wide && (
            <Stamp thunk className={styles.cardStamp}>
              New sticker!
            </Stamp>
          )}
          {offerTutorial && <ChoiceCard puzzleId={puzzle.id} />}
        </div>
        {wide && (
          <PuzzlePanel
            ref={sidePageRef}
            slotRef={setSlot}
            campaignId={campaign.id}
            province={province}
            index={provinceIndex}
            number={number}
            storage={storage}
            hideSticker={hideSticker}
            stamped={moment === 'landed'}
            tag={tag}
          >
            {!done && (
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
                  {hintButton}
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
                  <HowToPlay back={`/play/${puzzle.id}`} className={styles.howTo} />
                  <ClearButton store={store} solved={false} disabled={!canClear} />
                </div>
              </div>
            )}
          </PuzzlePanel>
        )}
      </div>
      {(moment === 'flying' || moment === 'popping') && (
        <div ref={floatRef} className={styles.float} aria-hidden="true">
          {sticker}
        </div>
      )}
    </main>
  )
}

/** The after panel when this solve conquered the province: on to the next one, or the album's close. */
function Conquest({ campaign, province, children }: { campaign: Campaign; province: Province; children: ReactNode }) {
  const index = campaign.provinces.indexOf(province)
  const following = campaign.provinces[index + 1]
  return (
    <>
      <div className={styles.headline}>
        <Stamp thunk tone={following ? 'pink' : 'gold'} className={styles.afterStamp}>
          {following ? 'Page complete' : 'Album complete'}
        </Stamp>
        <p role="status">
          <b>{province.name} conquered.</b>
          {province.flavour && <span className={styles.flavour}>{province.flavour}</span>}
        </p>
      </div>
      {!following && <p className={styles.closing}>{campaign.closingLine || `${campaign.name} is yours.`}</p>}
      <div className={styles.afterActions}>
        {following ? (
          <Link
            to="/c/$campaignId/$provinceId"
            params={{ campaignId: campaign.id, provinceId: following.id }}
            className={styles.linkButton}
          >
            Open
            <span className={styles.tabChip} style={paperStyle(index + 1)}>
              {following.name.replace(/^The /, '')}
            </span>
            <ArrowIcon />
          </Link>
        ) : (
          <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} className={styles.linkButton}>
            Back to the cover
          </Link>
        )}
        <Link
          to="/c/$campaignId/$provinceId"
          params={{ campaignId: campaign.id, provinceId: province.id }}
          className={`${styles.linkButton} ${styles.paper}`}
        >
          Back to page
        </Link>
        {children}
      </div>
    </>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}
