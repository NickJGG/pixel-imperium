/**
 * A track's Lessons on the real board (the Tutorial at `/learn`, the Techniques at `/learn/techniques`),
 * with a coach card where the puzzle page has its side page, then the handoff. Gated Lessons pass their
 * steps on fixed assists; a `free` one is played on the player's own assists, with a local Hint. Nothing
 * here is saved but the place to resume from.
 */
import { type CSSProperties, type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
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
import { loadResume, saveResume } from './resume.ts'
import type { Track } from './tracks.ts'
import { cellsBefore, currentStep, feedback, isWrong, stepCells, wrongCell } from './steps.ts'
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

export function LessonPage({ track, handoff }: { track: Track; handoff: Handoff }) {
  const [at, setAt] = useState(() => loadResume(track))
  const [finished, setFinished] = useState(false)
  if (finished) return <HandoffView track={track} handoff={handoff} />
  return (
    <Lesson
      key={at.lesson}
      track={track}
      index={at.lesson}
      startStep={at.step}
      handoff={handoff}
      onNext={() => setAt({ lesson: at.lesson + 1, step: 0 })}
      onFinish={() => setFinished(true)}
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

interface LessonProps {
  track: Track
  index: number
  startStep: number
  handoff: Handoff
  onNext: () => void
  onFinish: () => void
}

function Lesson({ track, index, startStep, handoff, onNext, onFinish }: LessonProps) {
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

  const [lineHints] = useState(() => createLineHints(store.puzzle))
  const hints = useMemo(() => lineHints(cells), [lineHints, cells])
  const { fadeClues, impossibleLines } = assists
  const clueAssists = useMemo(() => ({ fade: fadeClues, impossible: impossibleLines }), [fadeClues, impossibleLines])

  const [mistake, setMistake] = useState<number | null>(null)
  useEffect(() => {
    if (free) return
    let before = store.getState().cells
    return store.subscribe(() => {
      const { cells } = store.getState()
      if (cells === before) return
      const prev = before
      before = cells
      setMistake(cited => wrongCell(puzzle, cells, prev, cited))
    })
  }, [store, puzzle, free])
  const cited = !solved && mistake !== null && isWrong(puzzle, cells, mistake) ? mistake : null

  useEffect(() => {
    if (!solved) saveResume(track, { lesson: index, step: Math.min(step, lesson.steps.length - 1) })
  }, [track, index, step, solved, lesson])

  useEffect(() => {
    if (!solved || store.getState().palette) return
    store.setPalette(puzzle.palette)
    play('pop')
    saveResume(track, index + 1 < lessons.length ? { lesson: index + 1, step: 0 } : null)
  }, [solved, store, puzzle, track, lessons, index])

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
                  mistake={cited}
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
          solved={solved}
          feedback={cited === null ? null : feedback(puzzle, cells, cited)}
          handoff={handoff}
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
  solved: boolean
  feedback: string | null
  handoff: Handoff
  onNext: () => void
  onFinish: () => void
}

function Coach({ track, lesson, index, step, solved, feedback, handoff, onNext, onFinish }: CoachProps) {
  const { steps } = lesson
  const shown = steps[Math.min(step, steps.length - 1)]!
  const { lessons } = track
  const last = index === lessons.length - 1
  return (
    <aside className={styles.coach} style={paperStyle(0)} aria-labelledby="lesson-title">
      <div className={styles.coachTop}>
        <span className={styles.label}>
          Lesson {index + 1} of {lessons.length}
          {track.id === 'techniques' && ' · Techniques'}
        </span>
        <ol className={styles.lessons} aria-hidden="true">
          {lessons.map((_, i) => (
            <li key={i} data-state={i < index ? 'done' : i === index ? 'now' : undefined}>
              {i + 1}
            </li>
          ))}
        </ol>
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
        {solved ? <p>{lesson.done}</p> : shown.text.map((p, i) => <p key={i}>{rich(p)}</p>)}
        {!solved && shown.slide && <Slide {...shown.slide} />}
      </div>
      {feedback && (
        <p className={styles.feedback} role="status">
          {rich(feedback)}
        </p>
      )}
      <div className={styles.foot}>
        <Link to={handoff.to} className={styles.skip}>
          {track.skipText}
        </Link>
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

/** A block pushed to each end of its line, and the cells it covers both ways. */
function Slide({ block, line }: { block: number; line: number }) {
  const left = (i: number) => i < block
  const right = (i: number) => i >= line - block
  const rows = [
    { label: 'left', covers: left },
    { label: 'right', covers: right },
    { label: 'both', covers: (i: number) => left(i) && right(i) },
  ]
  return (
    <div className={styles.slide} role="img" aria-label={`A block of ${block} pushed left and right in ${line} cells`}>
      {rows.map(({ label, covers }) => (
        <div key={label} className={styles.slideRow} style={{ '--line': line } as CSSProperties}>
          <span>{label}</span>
          {Array.from({ length: line }, (_, i) => (
            <b key={i} data-state={covers(i) ? (left(i) && right(i) ? 'both' : 'on') : undefined} />
          ))}
        </div>
      ))}
    </div>
  )
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
