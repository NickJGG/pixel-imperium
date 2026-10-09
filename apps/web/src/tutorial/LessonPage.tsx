/**
 * One Lesson of a track on the real board (at `/learn/<track>/<lesson>`), with a coach card where the
 * puzzle page has its side page; Next goes on to the track's next Lesson, and the last one ends on Learn
 * or, for a deep link, the handoff. Gated Lessons pass their
 * steps on fixed assists; a `free` one is played on the player's own assists, with a local Hint. Nothing
 * here is saved but the place to resume from and which Lessons are done.
 */
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { type Cell, hintFor } from '@pixel-imperium/nonogram'
import type { Assists } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { paperStyle } from '../album/paper.ts'
import { PixelArt } from '../campaign/PixelArt.tsx'
import { useSettings } from '../settings.ts'
import { play } from '../sound.ts'
import { AssistChips } from '../play/AssistChips.tsx'
import { Board } from '../play/Board.tsx'
import { ColClues, RowClues } from '../play/Clues.tsx'
import { useBoardGestures } from '../play/gestures.ts'
import { HintButton, hintText } from '../play/HintButton.tsx'
import { SIDE_PAGE_GAP, boardTracks, fitCellSize } from '../play/layout.ts'
import { createLineHints } from '../play/line-hints.ts'
import { ProgressStorage } from '../play/progress-storage.ts'
import { type PlayState, PlayStore, crosshairOf } from '../play/store.ts'
import { ToolToggle } from '../play/ToolToggle.tsx'
import { BoardView } from '../play/viewport.ts'
import type { Handoff } from './handoff.ts'
import { type Lesson as LessonData, type LessonPuzzle, lessonPuzzle } from './lessons.ts'
import { markDone, useLessonsDone } from './done.ts'
import { loadResume, saveResume } from './resume.ts'
import { type Track, lessonKey } from './tracks.ts'
import { type Cite, cellsBefore, cite, citedFlag, currentStep, lessonFeedback, stepCells } from './steps.ts'
import playStyles from '../play/Play.module.css'
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
      onFinish={() => (learn ? void navigate({ to: '/learn', search: { back } }) : setFinished(true))}
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
  const shown = lesson.steps[Math.min(step, lesson.steps.length - 1)]!
  const highlight = useMemo(() => (solved ? [] : stepCells(shown, width)), [solved, shown, width])
  const { rows: rowLines = [], cols: colLines = [] } = solved ? {} : shown.highlight

  const [beat, setBeat] = useState(0)
  const [beatStep, setBeatStep] = useState(step)
  if (beatStep !== step) {
    setBeatStep(step)
    setBeat(0)
  }
  const lastBeat = shown.beats.length - 1
  const next = () => setBeat(b => Math.min(b + 1, lastBeat))

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
  const flagged =
    flag && cited
      ? {
          cell: cited.cell,
          text: lessonFeedback(puzzle, lesson.steps[Math.min(cited.step, lesson.steps.length - 1)]!, cells[cited.cell]!, flag),
        }
      : null

  useEffect(() => {
    if (!solved) saveResume(track, { lesson: lesson.id, step: Math.min(step, lesson.steps.length - 1) })
  }, [track, step, solved, lesson])

  useEffect(() => {
    if (!solved || store.getState().palette) return
    store.setPalette(puzzle.palette)
    play('pop')
    markDone(lessonKey(track, lesson))
    const next = lessons[index + 1]
    saveResume(track, next ? { lesson: next.id, step: 0 } : null)
  }, [solved, store, puzzle, track, lesson, lessons, index])

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

  const [boardView] = useState(() => new BoardView(store.puzzle, false))
  const boardRef = useBoardGestures(store, boardView, free ? undefined : FIXED)
  const stageRef = useRef<HTMLDivElement>(null)
  const [cellSize, setCellSize] = useState(0)
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      setCellSize(fitCellSize({ width, height }, store.puzzle))
    })
    observer.observe(stageRef.current!)
    return () => observer.disconnect()
  }, [store])

  return (
    <main className={`${playStyles.play} ${styles.page}`}>
      <div className={`${playStyles.desk} ${styles.desk}`} style={{ gap: SIDE_PAGE_GAP }}>
        <div className={`${playStyles.card} ${styles.card}`}>
          <header className={playStyles.cardHead}>
            <Dymo tone="pink">{track.label}</Dymo>
            <span className={playStyles.size}>
              Lesson {index + 1} of {lessons.length} · {lesson.picture} · {width}×{height}
            </span>
          </header>
          <div ref={stageRef} className={`${playStyles.stage} ${styles.stage}`}>
            {cellSize > 0 && (
              <div
                ref={boardRef}
                className={playStyles.board}
                data-revealed={palette !== null || undefined}
                style={boardTracks(puzzle, cellSize) as CSSProperties}
              >
                <div />
                <ColClues lines={puzzle.clues.cols} hints={hints.cols} active={crossCol} assists={clueAssists} highlight={colLines} />
                <RowClues lines={puzzle.clues.rows} hints={hints.rows} active={crossRow} assists={clueAssists} highlight={rowLines} />
                <Board
                  store={store}
                  cellSize={cellSize}
                  view={boardView}
                  assists={free ? undefined : FIXED}
                  highlight={highlight}
                  mistake={flagged?.cell ?? null}
                />
              </div>
            )}
          </div>
          <div className={playStyles.tools} inert={solved}>
            {free && (
              <p className={playStyles.hintLine} role="status">
                {hint && <Dymo tone="pink">{hintText(hint, cells, width)}</Dymo>}
              </p>
            )}
            <div className={playStyles.dock}>
              <ToolToggle store={store} />
              {free && !solved && (
                <HintButton
                  store={store}
                  confirmFirst
                  note={FREE_HINT_NOTE}
                  request={async cells => hintFor(puzzle.palette, cells)}
                  onError={() => {}}
                />
              )}
            </div>
            {free && <AssistChips />}
          </div>
        </div>
        <Coach
          track={track}
          lesson={lesson}
          index={index}
          step={step}
          beat={beat}
          onBeat={next}
          solved={solved}
          feedback={flagged?.text ?? null}
          foot={foot}
          onNext={onNext}
          onFinish={onFinish}
        />
      </div>
    </main>
  )
}

interface CoachProps {
  track: Track
  lesson: LessonData
  index: number
  step: number
  beat: number
  onBeat: () => void
  solved: boolean
  feedback: string | null
  foot: Foot
  onNext: () => void
  onFinish: () => void
}

function Coach({ track, lesson, index, step, beat, onBeat, solved, feedback, foot, onNext, onFinish }: CoachProps) {
  const { steps } = lesson
  const shown = steps[Math.min(step, steps.length - 1)]!
  const { lessons } = track
  const last = index === lessons.length - 1
  const done = useLessonsDone()
  const dotState = (i: number) => (i === index ? 'now' : done.has(lessonKey(track, lessons[i]!)) ? 'done' : undefined)
  return (
    <aside className={styles.coach} style={paperStyle(0)} aria-labelledby="lesson-title">
      <div className={styles.coachTop}>
        <span className={styles.label}>
          Lesson {index + 1} of {lessons.length}
          {track.id === 'techniques' && ' · Techniques'}
        </span>
        {foot.learn ? (
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
      </div>
      <h1 id="lesson-title" className={styles.coachTitle}>
        {solved ? `${lesson.picture} revealed!` : lesson.title}
      </h1>
      {steps.length > 1 && (
        <ol className={styles.steps} aria-label={solved ? 'All steps done' : `Step ${step + 1} of ${steps.length}`}>
          {steps.map((_, i) => (
            <li key={i} data-state={solved || i < step ? 'done' : i === step ? 'now' : undefined} />
          ))}
        </ol>
      )}
      <div className={styles.text} aria-live="polite">
        <p>{solved ? lesson.done : rich(shown.beats[beat]!.text)}</p>
      </div>
      {!solved && beat < shown.beats.length - 1 && (
        <button type="button" onClick={onBeat}>
          Next →
        </button>
      )}
      {feedback && (
        <p className={styles.feedback} role="status">
          {rich(feedback)}
        </p>
      )}
      <div className={styles.foot}>
        {foot.handoff ? (
          <Link to={foot.handoff.to} className={styles.skip}>
            {track.skipText}
          </Link>
        ) : (
          <Link to="/learn" search={{ back: foot.back }} className={styles.skip}>
            All lessons
          </Link>
        )}
        {solved && (
          <button type="button" data-variant="primary" onClick={last ? onFinish : onNext}>
            {last ? 'Finish' : 'Next lesson'} →
          </button>
        )}
      </div>
    </aside>
  )
}

/** Renders the steps' `**bold**`, `_italic_` and `` `key` `` spans. */
function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/).map((part, i) => {
    if (i % 2 === 0) return part
    if (part.startsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>
    if (part.startsWith('`')) return <kbd key={i}>{part.slice(1, -1)}</kbd>
    return <i key={i}>{part.slice(1, -1)}</i>
  })
}

const TILTS = [-4, 3, -2, 4, -3]

function HandoffView({ track, handoff }: { track: Track; handoff: Handoff }) {
  const { lessons } = track
  const pictures = useMemo(() => lessons.map(lessonPuzzle), [lessons])
  return (
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
        <Link to={handoff.to} className={playStyles.linkButton}>
          {handoff.action}
        </Link>
      </section>
    </main>
  )
}
