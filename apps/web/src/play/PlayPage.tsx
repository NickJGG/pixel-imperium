import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { progressPercent } from '@pixel-imperium/nonogram'
import type { Campaign, Province, PuzzleClues } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { SoundIcon } from '../album/icons.tsx'
import { Slot } from '../album/Slot.tsx'
import { pageOf } from '../album/Spread.tsx'
import { Stamp } from '../album/Stamp.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { type AccountState, useAccount } from '../account.ts'
import { submitSolve } from '../api.ts'
import { campaignProgress, isOpen, nextPuzzle } from '../campaign/progress.ts'
import { LockedProvince } from '../campaign/ProvincePage.tsx'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { getSettings, updateSettings, useSettings } from '../settings.ts'
import { play } from '../sound.ts'
import { AssistChips } from './AssistChips.tsx'
import { Board, REVEAL_MS } from './Board.tsx'
import { ClearButton, LoopIcon } from './ClearButton.tsx'
import { ColClues, RowClues } from './Clues.tsx'
import { CLUE_SLOT, SIDE_PAGE_GAP, SIDE_PAGE_WIDTH, fitPlay } from './layout.ts'
import { createLineHints } from './line-hints.ts'
import { SidePage } from './SidePage.tsx'
import { type Choreography, confetti, flyIn, popOnly } from './sticker-moment.ts'
import { type PlayState, PlayStore, crosshairOf, freshCells } from './store.ts'
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
  const canUndo = useStoreValue(store, s => s.canUndo)
  const canRedo = useStoreValue(store, s => s.canRedo)
  const mode = useStoreValue(store, s => s.mode)
  const solved = useStoreValue(store, s => s.solved)
  const [conqueredBefore] = useState(isConquered)
  const conquest = solved && !conqueredBefore && isConquered()
  const next = solved ? nextPuzzle(province.puzzles, puzzle.id, id => storage.loadSolved(id) !== null) : null
  const replaying = useStoreValue(store, s => s.replaying)
  const unverified = !solved && storage.loadSolved(puzzle.id) === 'unverified'
  const palette = useStoreValue(store, s => s.palette)
  const cells = useStoreValue(store, s => s.cells)
  const percent = useMemo(() => progressPercent(cells, puzzle.filledCount, false), [cells, puzzle.filledCount])
  const settings = useSettings()
  const fresh = useMemo(() => freshCells(puzzle, settings.autoMarkEmptyLines), [puzzle, settings.autoMarkEmptyLines])
  const canClear = useMemo(() => cells.some((c, i) => c !== fresh[i]), [cells, fresh])
  const crossRow = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.row ?? null) : null))
  const crossCol = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.col ?? null) : null))

  const [lineHints] = useState(() => createLineHints(puzzle))
  const hints = useMemo(() => lineHints(cells), [lineHints, cells])
  const { fadeClues, impossibleLines } = settings
  const assists = useMemo(() => ({ fade: fadeClues, impossible: impossibleLines }), [fadeClues, impossibleLines])

  const stageRef = useRef<HTMLDivElement>(null)
  const sidePageShown = useRef(false)
  const [fit, setFit] = useState<{ cellSize: number; sidePage: boolean } | null>(null)
  useLayoutEffect(() => {
    // The stage loses the side page's width while it shows; the fit is always made as if it didn't.
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      const room = sidePageShown.current ? SIDE_PAGE_WIDTH + SIDE_PAGE_GAP : 0
      const next = fitPlay({ width: width + room, height }, puzzle)
      sidePageShown.current = next.sidePage
      setFit(next)
    })
    observer.observe(stageRef.current!)
    return () => observer.disconnect()
  }, [puzzle])
  const cellSize = fit?.cellSize ?? 0

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
      res => (res.solved ? store.setPalette(res.palette) : setRevealFailed(true)),
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
      float.style.width = `${slot.width}px`
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
  const done = solved && !hideSticker
  const left = province.puzzles.filter(p => storage.loadSolved(p.id) === null).length
  const art = palette ?? Array<null>(puzzle.width * puzzle.height).fill(null)
  const sticker = (
    <Sticker
      title={puzzle.title}
      width={puzzle.width}
      height={puzzle.height}
      palette={art}
      gold={number === GOLD_SLOT}
      tilt={tiltOf(puzzle.id)}
    />
  )

  return (
    <main className={styles.play}>
      <div className={styles.crumb}>
        <Link to="/c/$campaignId/$provinceId" params={{ campaignId: campaign.id, provinceId: province.id }}>
          ← {province.name} · p. {pageOf(provinceIndex, number)}
        </Link>
        {replaying ? (
          <Dymo className={styles.tag}>
            <LoopIcon />
            Replaying {percent}%
          </Dymo>
        ) : moment === 'kept' ? (
          <Dymo tone="pink" className={styles.tag}>
            Sticker kept
          </Dymo>
        ) : (
          unverified && <Dymo className={styles.tag}>Imported: replay to verify</Dymo>
        )}
      </div>
      <div className={styles.desk} style={{ gap: SIDE_PAGE_GAP }}>
        <div ref={cardRef} className={styles.card}>
          <header className={styles.cardHead}>
            {fit && !fit.sidePage && (
              <span ref={setSlot} className={styles.slotChip} aria-label={`Slot ${number}`}>
                {solved && !hideSticker ? (
                  <Slot number={number} width={puzzle.width} height={puzzle.height}>
                    {sticker}
                  </Slot>
                ) : (
                  <Slot number={number} width={puzzle.width} height={puzzle.height} gold={number === GOLD_SLOT} next />
                )}
              </span>
            )}
            <h1 className={styles.title}>
              #{number} {puzzle.title}
            </h1>
            <span className={styles.size}>
              {puzzle.width}×{puzzle.height}
            </span>
            {!solved && !replaying && percent > 0 && <span className={styles.percent}>{percent}%</span>}
            <button
              type="button"
              className={styles.iconButton}
              aria-label={settings.sound ? 'Sound on. Turn it off.' : 'Sound off. Turn it on.'}
              aria-pressed={settings.sound}
              onClick={() => updateSettings({ sound: !settings.sound })}
            >
              <SoundIcon on={settings.sound} />
            </button>
          </header>
          <div ref={stageRef} className={styles.stage}>
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
          {done ? (
            <div className={styles.after}>
              {conquest ? (
                <>
                  <p role="status">
                    <b>Page complete!</b> Every slot in {province.name} is filled.
                  </p>
                  <div className={styles.afterActions}>
                    <Link to="/c/$campaignId/map" params={{ campaignId: campaign.id }} className={styles.linkButton}>
                      See it on the map
                    </Link>
                    <ClearButton store={store} solved />
                  </div>
                </>
              ) : (
                <>
                  <p role="status">
                    {moment === 'landed'
                      ? `Sticker #${number} added to ${province.name}. ${left === 0 ? 'Page complete.' : `${left} to go.`}`
                      : moment === 'kept'
                        ? `Solved again. Sticker #${number} stays where it is.`
                        : `Sticker #${number} is in the album.`}
                  </p>
                  <div className={styles.afterActions}>
                    {next && (
                      <Link to="/play/$id" params={{ id: next.id }} className={styles.linkButton}>
                        Next: #{province.puzzles.indexOf(next) + 1}
                        <ArrowIcon />
                      </Link>
                    )}
                    <Link
                      to="/c/$campaignId/$provinceId"
                      params={{ campaignId: campaign.id, provinceId: province.id }}
                      className={`${styles.linkButton} ${styles.paper}`}
                    >
                      Back to page
                    </Link>
                    <ClearButton store={store} solved />
                  </div>
                </>
              )}
            </div>
          ) : (
            // Kept through the fly-in so the board doesn't resize under the sticker.
            <div className={styles.tools} inert={solved}>
              <div className={styles.dock}>
                <div className={`${styles.seg} ${styles.touchOnly}`} role="group" aria-label="Touch tool">
                  {(['fill', 'mark'] as const).map(m => (
                    <button key={m} type="button" aria-pressed={mode === m} onClick={() => store.setMode(m)}>
                      {m === 'fill' ? <i className={styles.fillSwatch} aria-hidden="true" /> : <CrossIcon />}
                      {m === 'fill' ? 'Fill' : 'Cross'}
                    </button>
                  ))}
                </div>
                <div className={styles.seg}>
                  <button
                    type="button"
                    aria-pressed={settings.lockLine}
                    onClick={() => updateSettings({ lockLine: !settings.lockLine })}
                  >
                    <svg viewBox="0 0 10 10" aria-hidden="true">
                      <path d="M1 5h8" />
                    </svg>
                    Lock line
                  </button>
                </div>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Undo"
                  disabled={!canUndo}
                  onClick={() => store.undo()}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M9 14 4 9l5-5" />
                    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label="Redo"
                  disabled={!canRedo}
                  onClick={() => store.redo()}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="m15 14 5-5-5-5" />
                    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
                  </svg>
                </button>
                <ClearButton store={store} solved={false} disabled={!canClear} />
              </div>
              <AssistChips />
            </div>
          )}
          {moment === 'landed' && !fit?.sidePage && (
            <Stamp thunk solid className={styles.cardStamp}>
              New sticker!
            </Stamp>
          )}
        </div>
        {fit?.sidePage && (
          <SidePage
            ref={sidePageRef}
            slotRef={setSlot}
            province={province}
            index={provinceIndex}
            number={number}
            storage={storage}
            hideSticker={hideSticker}
            stamped={moment === 'landed'}
          />
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

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  )
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true">
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  )
}
