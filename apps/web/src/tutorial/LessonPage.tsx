/**
 * One Lesson of a track on the real board (at `/learn/<track>/<lesson>`), with a coach card where the
 * puzzle page has its side page; Next goes on to the track's next Lesson, and the last one ends on Learn
 * or, for a deep link, the handoff. Gated Lessons pass their
 * steps on fixed assists; a `free` one is played on the player's own assists, with a local Hint. Nothing
 * here is saved but the place to resume from and which Lessons are done.
 */
import { type CSSProperties, type Ref, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { type Cell, hintFor } from '@pixel-imperium/nonogram'
import type { Assists } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { paperStyle } from '../album/paper.ts'
import { PixelArt } from '../campaign/PixelArt.tsx'
import { getPadMode } from '../pad/mode.ts'
import { PanelTag } from '../pad/PadGlyph.tsx'
import { usePadPage } from '../pad/PadProvider.tsx'
import { rumble } from '../pad/rumble.ts'
import { firstFocusable, focusDefault } from '../pad/spatial.ts'
import { Hud, HudPills } from '../Hud.tsx'
import { REVEAL_GUARD_MS } from '../pad/tuning.ts'
import { useSettings } from '../settings.ts'
import { play } from '../sound.ts'
import { AssistChips } from '../play/AssistChips.tsx'
import { Board, type BoardFlag, REVEAL_MS } from '../play/Board.tsx'
import { ColClues, RowClues } from '../play/Clues.tsx'
import { ControlsCard } from '../play/ControlsCard.tsx'
import { useBoardGestures } from '../play/gestures.ts'
import { HintButton, cellHintText } from '../play/HintButton.tsx'
import { RAIL_WIDTH, SIDE_PAGE_GAP, boardTracks, clueDepth, clueSlot, fitCellSize } from '../play/layout.ts'
import { createLineHints } from '../play/line-hints.ts'
import { ProgressStorage } from '../play/progress-storage.ts'
import { type PlayState, PlayStore, crosshairOf } from '../play/store.ts'
import { ToolToggle } from '../play/ToolToggle.tsx'
import { useUndoKeys } from '../play/useUndoKeys.ts'
import { BoardView } from '../play/viewport.ts'
import { type BeatView, BeatLayer, Dock, type Tag } from './BeatLayer.tsx'
import { type Handoff, backLink } from './handoff.ts'
import { LessonFilm } from './LessonFilm.tsx'
import { type Lesson as LessonData, type LessonPuzzle, lessonPuzzle } from './lessons.ts'
import { markDone, useLessonsDone } from './done.ts'
import { type BoardBox, placeCallout } from './placement.ts'
import { loadResume, saveResume } from './resume.ts'
import { rich } from './rich.tsx'
import { type Track, lessonKey } from './tracks.ts'
import { type Cite, cellsBefore, cite, citedFlag, currentStep, lessonFeedback, stepCells } from './steps.ts'
import playStyles from '../play/Play.module.css'
import beatStyles from './BeatLayer.module.css'
import styles from './Lesson.module.css'

/** Gated Lessons: everything that helps read the board, but no auto-marking, which would give the 0s away. */
const FIXED: Assists = {
  fadeClues: true,
  impossibleLines: true,
  crosshair: true,
  autoMarkEmptyLines: false,
  lockLine: false,
}

const FREE_HINT_NOTE = "In a lesson it's free, so nothing is lost here."

interface PageProps {
  track: Track
  index: number
  /** `null` when opened from Learn, which the last Lesson finishes on instead. */
  handoff: Handoff | null
  back: string
  learn: boolean
}

export function LessonPage({ track, index, handoff, back, learn }: PageProps) {
  const navigate = useNavigate()
  const [startStep] = useState(() => {
    const saved = loadResume(track)
    return saved?.lesson === track.lessons[index]!.id ? saved.step : 0
  })
  const [finished, setFinished] = useState(false)
  if (finished && handoff) return <HandoffView track={track} handoff={handoff} />
  const next = track.lessons[index + 1]
  return (
    <Lesson
      track={track}
      index={index}
      startStep={startStep}
      foot={{ handoff, back, learn }}
      onNext={() =>
        void navigate({
          to: '/learn/$track/$lesson',
          params: { track: track.id, lesson: next!.id },
          search: { back, ...(learn ? { learn: true as const } : {}) },
        })
      }
      onFinish={() =>
        learn ? void navigate({ to: '/learn/$track', params: { track: track.id }, search: { back } }) : setFinished(true)
      }
    />
  )
}

/** Keeps nothing, so a Lesson never touches saved play; it opens on `start`. */
class LessonStorage extends ProgressStorage {
  private readonly start: Cell[]

  constructor(start: Cell[]) {
    super(null)
    this.start = start
  }

  override loadProgress(): Cell[] {
    return this.start
  }
  override loadSolved(): null {
    return null
  }
  override loadReplay(): boolean {
    return false
  }
  override loadPalette(): null {
    return null
  }
  override loadHinted(): boolean {
    return false
  }
  override saveCells(): void {}
  override saveSolved(): void {}
  override saveReplay(): void {}
  override clearReplay(): void {}
  override savePalette(): void {}
  override saveFoil(): void {}
  override saveHinted(): void {}
}

function useStoreValue<T>(store: PlayStore, select: (s: PlayState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()))
}

/** How the coach's foot leaves: back to Learn, or for a deep link, to the handoff. */
interface Foot {
  handoff: Handoff | null
  back: string
  learn: boolean
}

interface LessonProps {
  track: Track
  index: number
  startStep: number
  foot: Foot
  onNext: () => void
  onFinish: () => void
}

function Lesson({ track, index, startStep, foot, onNext, onFinish }: LessonProps) {
  const { lessons } = track
  const lesson = lessons[index]!
  const free = lesson.free === true
  const [puzzle] = useState(() => lessonPuzzle(lesson))
  const { width, height } = puzzle
  const settings = useSettings()
  const assists = free ? settings : FIXED
  const [store] = useState(
    () =>
      new PlayStore(
        { id: `${track.id}-${index + 1}`, width, height, clues: puzzle.clues },
        {
          autoMarkEmptyLines: assists.autoMarkEmptyLines,
          storage: new LessonStorage(cellsBefore(lesson, startStep, width, height)),
        },
      ),
  )
  const cells = useStoreValue(store, s => s.cells)
  const solved = useStoreValue(store, s => s.solved)
  const palette = useStoreValue(store, s => s.palette)
  const hint = useStoreValue(store, s => s.hint)
  const crossRow = useStoreValue(store, s => (assists.crosshair ? (crosshairOf(s)?.row ?? null) : null))
  const crossCol = useStoreValue(store, s => (assists.crosshair ? (crosshairOf(s)?.col ?? null) : null))

  const step = currentStep(lesson, cells, width)
  const stepIndex = Math.min(step, lesson.steps.length - 1)
  const shown = lesson.steps[stepIndex]!

  const [beat, setBeat] = useState(0)
  const [beatStep, setBeatStep] = useState(step)
  if (beatStep !== step) {
    setBeatStep(step)
    setBeat(0)
  }
  const lastBeat = shown.beats.length - 1
  const shownBeat = shown.beats[Math.min(beat, lastBeat)]!
  const talk = !solved && beat < lastBeat
  const next = () => setBeat(b => Math.min(b + 1, lastBeat))
  const beatKey = `${stepIndex}.${beat}`

  const [log, setLog] = useState<LogEntry[]>([])
  if (!solved && beatStep === step && !log.some(e => e.key === beatKey)) setLog([...log, { key: beatKey, text: shownBeat.text }])

  const about = useMemo(() => {
    const { rows = [], cols = [] } = solved || shownBeat.whole ? {} : shown.highlight
    return { rows, cols }
  }, [solved, shownBeat, shown])
  const highlight = useMemo(() => (solved || talk ? [] : stepCells(shown, width)), [solved, talk, shown, width])

  const [lineHints] = useState(() => createLineHints(store.puzzle))
  const hints = useMemo(() => lineHints(cells), [lineHints, cells])
  const { fadeClues, impossibleLines } = assists
  const clueAssists = useMemo(() => ({ fade: fadeClues, impossible: impossibleLines }), [fadeClues, impossibleLines])

  const [cited, setCited] = useState<Cite | null>(null)
  useEffect(() => {
    if (free) return
    let before = store.getState().cells
    return store.subscribe(() => {
      const { cells } = store.getState()
      if (cells === before) return
      const prev = before
      before = cells
      setCited(c => cite(puzzle, lesson, cells, prev, c))
    })
  }, [store, puzzle, lesson, free])
  const flag = solved ? null : citedFlag(puzzle, lesson, cells, cited)
  const flagCell = flag && cited ? cited.cell : null
  const flagTone: BoardFlag['tone'] | null = flag && (flag.kind === 'ruled' ? 'mistake' : flag.kind)
  const boardFlag = useMemo(() => (flagCell === null || !flagTone ? null : { index: flagCell, tone: flagTone }), [flagCell, flagTone])
  const tag: Tag | null =
    flag && cited && flagTone
      ? {
          cell: cited.cell,
          tone: flagTone,
          text: lessonFeedback(puzzle, lesson.steps[Math.min(cited.step, lesson.steps.length - 1)]!, cells[cited.cell]!, flag),
        }
      : free && hint && !solved
        ? { cell: hint.index, tone: 'aside', text: cellHintText(hint, cells) }
        : null

  useEffect(() => {
    if (!solved) saveResume(track, { lesson: lesson.id, step: stepIndex })
  }, [track, stepIndex, solved, lesson])

  useEffect(() => {
    if (!solved || store.getState().palette) return
    store.setPalette(puzzle.palette)
    play('pop')
    rumble('solve')
    markDone(lessonKey(track, lesson))
    const next = lessons[index + 1]
    saveResume(track, next ? { lesson: next.id, step: 0 } : null)
  }, [solved, store, puzzle, track, lesson, lessons, index])

  // A controller's A waits out the reveal, then the focus moves from the board to the coach's Next.
  const [revealing, setRevealing] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const coachRef = useRef<HTMLElement>(null)
  useEffect(() => {
    if (!solved) return
    setRevealing(true)
    const timer = setTimeout(() => setRevealing(false), REVEAL_MS + REVEAL_GUARD_MS)
    const frame = requestAnimationFrame(() => {
      const active = document.activeElement
      if (getPadMode() && (active === document.body || stageRef.current?.contains(active))) focusDefault()
    })
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(frame)
    }
  }, [solved])
  usePadPage({
    panel: () => {
      const coach = coachRef.current
      return coach && (coach.querySelector<HTMLElement>('[data-variant="primary"]') ?? firstFocusable(coach))
    },
    hold: revealing,
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && talk && !e.repeat && !(e.ctrlKey || e.metaKey || e.altKey)) {
        if (e.target instanceof Element && e.target.closest('button, a, input, select, textarea')) return
        setBeat(b => Math.min(b + 1, lastBeat))
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [talk, lastBeat])
  useUndoKeys(store)

  const [boardView] = useState(() => new BoardView(store.puzzle, false))
  const boardRef = useBoardGestures(store, boardView, free ? undefined : FIXED)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      setStage({ width, height })
    })
    observer.observe(stageRef.current!)
    return () => observer.disconnect()
  }, [])
  const cellSize = stage.width > 0 ? fitCellSize(stage, store.puzzle) : 0
  const stacked = useMedia(STACKED)

  const slot = clueSlot(cellSize)
  const board: BoardBox = {
    width,
    height,
    cell: cellSize,
    rowDepth: clueDepth(puzzle.clues.rows, slot),
    colDepth: clueDepth(puzzle.clues.cols, slot),
  }
  const at = placeCallout({
    board,
    lines: about,
    whole: shownBeat.whole === true,
    stacked,
    stage,
    boardLeft: Math.max(0, (stage.width - board.rowDepth - width * cellSize) / 2),
  })
  const view: BeatView = {
    key: beatKey,
    beat: shownBeat,
    index: beat,
    count: shown.beats.length,
    talk,
    onNext: next,
    tools: stacked ? 'below' : 'beside',
  }
  const anchor = solved ? undefined : shownBeat.anchor

  const tools = (
    <>
      <div className={stacked ? playStyles.dock : styles.railTools}>
        <ToolToggle store={store} />
        {free && !solved && (
          <span className={anchor === 'hint' ? beatStyles.beckon : undefined}>
            <HintButton
              store={store}
              confirmFirst
              note={FREE_HINT_NOTE}
              request={async cells => hintFor(puzzle.palette, cells)}
              onError={() => {}}
            />
          </span>
        )}
      </div>
      {free && (
        <div className={anchor === 'assists' ? beatStyles.beckon : undefined}>
          <AssistChips />
        </div>
      )}
    </>
  )
  const meta = `${lesson.picture} · ${width}×${height}`

  // One tree for both layouts, like Play's: the strip, header and rail sit in fixed child positions around the
  // stage, so switching between them never remounts the board.
  return (
    <>
      {stacked && <Hud />}
      <main
        className={stacked ? `${playStyles.play} ${styles.page}` : `${playStyles.shell} ${styles.shell}`}
        data-rail={!stacked || undefined}
        style={paperStyle(track.paper)}
      >
        <div className={stacked ? `${playStyles.desk} ${styles.desk}` : playStyles.shellBody} style={stacked ? { gap: SIDE_PAGE_GAP } : undefined}>
          {!stacked && <LessonFilm track={track} index={index} back={foot.learn ? foot.back : null} />}
          <div className={stacked ? `${playStyles.card} ${styles.card}` : `${playStyles.surface} ${styles.surface}`}>
            {stacked && (
              <header className={playStyles.cardHead}>
                <Dymo tone="pink">{track.label}</Dymo>
                <span className={playStyles.size}>{meta}</span>
              </header>
            )}
            <div ref={stageRef} className={`${playStyles.stage} ${styles.stage}`}>
              {cellSize > 0 && (
                <div
                  ref={boardRef}
                  className={`${playStyles.board} ${styles.board}`}
                  data-revealed={palette !== null || undefined}
                  style={boardTracks(puzzle, cellSize) as CSSProperties}
                >
                  <div />
                  <ColClues lines={puzzle.clues.cols} hints={hints.cols} active={crossCol} assists={clueAssists} highlight={about.cols} />
                  <RowClues lines={puzzle.clues.rows} hints={hints.rows} active={crossRow} assists={clueAssists} highlight={about.rows} />
                  <Board
                    store={store}
                    cellSize={cellSize}
                    view={boardView}
                    assists={free ? undefined : FIXED}
                    highlight={highlight}
                    flag={boardFlag}
                    onTalkNext={talk ? next : undefined}
                  />
                  {!solved && <BeatLayer board={board} view={view} lines={about} at={at} tag={stacked ? null : tag} />}
                </div>
              )}
            </div>
            {!solved && <Dock view={at === 'dock' ? view : null} tag={stacked ? tag : null} />}
            {stacked && (
              <div className={playStyles.tools} inert={solved}>
                {tools}
              </div>
            )}
          </div>
          <div
            className={stacked ? styles.side : `${playStyles.rail} ${styles.rail}`}
            style={stacked ? { gap: SIDE_PAGE_GAP } : { width: RAIL_WIDTH }}
            data-pad-panel={!stacked || undefined}
          >
            {!stacked && <HudPills className={playStyles.railPills} />}
            <Coach
              ref={coachRef}
              track={track}
              lesson={lesson}
              index={index}
              step={step}
              log={log}
              now={beatKey}
              solved={solved}
              foot={foot}
              rail={!stacked}
              meta={meta}
              onNext={onNext}
              onFinish={onFinish}
            />
            {!stacked && (
              <div className={styles.railBody} inert={solved}>
                {tools}
              </div>
            )}
            {!stacked && <ControlsCard solved={solved} lines={free} zoom={false} back="All lessons" />}
          </div>
        </div>
      </main>
    </>
  )
}

/** The layout where the coach drops under the board, as in Lesson.module.css. */
const STACKED = '(max-width: 860px)'

function useMedia(query: string): boolean {
  return useSyncExternalStore(
    notify => {
      const list = matchMedia(query)
      list.addEventListener('change', notify)
      return () => list.removeEventListener('change', notify)
    },
    () => matchMedia(query).matches,
  )
}

/** A beat said so far in this Lesson, keyed `step.beat`. */
interface LogEntry {
  key: string
  text: string
}

interface CoachProps {
  ref: Ref<HTMLElement>
  track: Track
  lesson: LessonData
  index: number
  step: number
  log: LogEntry[]
  /** The key of the beat being said. */
  now: string
  solved: boolean
  foot: Foot
  /** In the rail, where the filmstrip stands in for the Lesson dots and the rail is the pad's panel. */
  rail: boolean
  /** The picture and its size, shown under the title in the rail. */
  meta: string
  onNext: () => void
  onFinish: () => void
}

function Coach({ ref, track, lesson, index, step, log, now, solved, foot, rail, meta, onNext, onFinish }: CoachProps) {
  const { steps } = lesson
  const { lessons } = track
  const last = index === lessons.length - 1
  const done = useLessonsDone()
  const dotState = (i: number) => (i === index ? 'now' : done.has(lessonKey(track, lessons[i]!)) ? 'done' : undefined)
  const logRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const list = logRef.current
    if (list) list.scrollTop = list.scrollHeight
  }, [log.length])
  return (
    <aside ref={ref} className={styles.coach} aria-labelledby="lesson-title" data-pad-panel={!rail || undefined}>
      {rail ? (
        <Dymo tone="pink" className={styles.coachTrack}>
          {track.label}
        </Dymo>
      ) : foot.learn ? (
        <ol className={styles.lessons} aria-label="Lessons">
          {lessons.map((l, i) => (
            <li key={l.id} data-state={dotState(i)}>
              <Link
                to="/learn/$track/$lesson"
                params={{ track: track.id, lesson: l.id }}
                search={{ back: foot.back, learn: true }}
                aria-label={`Lesson ${i + 1}: ${l.title}`}
                aria-current={i === index ? 'page' : undefined}
              >
                {i + 1}
              </Link>
            </li>
          ))}
        </ol>
      ) : (
        <ol className={styles.lessons} aria-hidden="true">
          {lessons.map((l, i) => (
            <li key={l.id} data-state={dotState(i)}>
              {i + 1}
            </li>
          ))}
        </ol>
      )}
      <h1 id="lesson-title" className={styles.coachTitle}>
        {solved ? `${lesson.picture} revealed!` : lesson.title}
      </h1>
      {rail && <p className={styles.coachMeta}>{meta}</p>}
      {steps.length > 1 && (
        <ol className={styles.steps} aria-label={solved ? 'All steps done' : `Step ${step + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <li key={i} data-state={solved || i < step ? 'done' : i === step ? 'now' : undefined} />
          ))}
        </ol>
      )}
      {solved ? (
        <p className={styles.doneText} role="status">
          {lesson.done}
        </p>
      ) : (
        <ol ref={logRef} className={styles.log} aria-label="What the coach has said">
          {log.map(e => (
            <li key={e.key} aria-current={e.key === now ? 'step' : undefined}>
              {rich(e.text)}
            </li>
          ))}
        </ol>
      )}
      <div className={styles.foot}>
        {foot.handoff ? (
          <Link {...backLink(foot.handoff.to)} className={styles.skip}>
            {track.skipText}
          </Link>
        ) : (
          <Link to="/learn/$track" params={{ track: track.id }} search={{ back: foot.back }} className={styles.skip}>
            All lessons
          </Link>
        )}
        {solved && (
          <button type="button" data-variant="primary" data-pad-default onClick={last ? onFinish : onNext}>
            {last ? 'Finish' : 'Next lesson'} →
          </button>
        )}
      </div>
      {!solved && !rail && <PanelTag />}
    </aside>
  )
}

const TILTS = [-4, 3, -2, 4, -3]

function HandoffView({ track, handoff }: { track: Track; handoff: Handoff }) {
  const { lessons } = track
  const pictures = useMemo(() => lessons.map(lessonPuzzle), [lessons])
  return (
    <>
      <Hud />
      <main className={styles.handoffPage}>
        <section className={styles.handoff} aria-labelledby="handoff-title">
          <Dymo tone="pink">{track.doneDymo}</Dymo>
          <h1 id="handoff-title">{handoff.heading}</h1>
          <p>{handoff.text}</p>
          <div className={styles.minis}>
            {pictures.map((p: LessonPuzzle, k) => (
              <span key={k} className={styles.mini} style={{ '--tilt': `${TILTS[k]}deg`, '--w': p.width } as CSSProperties}>
                <PixelArt title={lessons[k]!.picture} width={p.width} height={p.height} palette={p.palette} />
              </span>
            ))}
          </div>
          <Link {...backLink(handoff.to)} data-variant="primary" data-pad-default>
            {handoff.action}
          </Link>
        </section>
      </main>
    </>
  )
}
