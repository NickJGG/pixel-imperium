import { type CSSProperties, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import type { PuzzleClues } from '@pixel-imperium/protocol'
import { submitSolve } from '../api.ts'
import { getSettings, useSettings } from '../settings.ts'
import { AssistChips } from './AssistChips.tsx'
import { Board } from './Board.tsx'
import { ColClues, RowClues } from './Clues.tsx'
import { CLUE_SLOT, fitCellSize } from './layout.ts'
import { createLineHints } from './line-hints.ts'
import { type PlayState, PlayStore, crosshairOf } from './store.ts'
import styles from './Play.module.css'

const route = getRouteApi('/play/$id')

export function PlayPage() {
  const puzzle = route.useLoaderData()
  return <Play key={puzzle.id} puzzle={puzzle} />
}

function useStoreValue<T>(store: PlayStore, select: (s: PlayState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()))
}

function Play({ puzzle }: { puzzle: PuzzleClues }) {
  const [store] = useState(() => new PlayStore(puzzle, { autoMarkEmptyLines: getSettings().autoMarkEmptyLines }))
  const canUndo = useStoreValue(store, s => s.canUndo)
  const canRedo = useStoreValue(store, s => s.canRedo)
  const mode = useStoreValue(store, s => s.mode)
  const solved = useStoreValue(store, s => s.solved)
  const revealed = useStoreValue(store, s => s.palette !== null)
  const cells = useStoreValue(store, s => s.cells)
  const settings = useSettings()
  const crossRow = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.row ?? null) : null))
  const crossCol = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.col ?? null) : null))

  const [lineHints] = useState(() => createLineHints(puzzle))
  const hints = useMemo(() => lineHints(cells), [lineHints, cells])
  const { fadeClues, impossibleLines } = settings
  const assists = useMemo(() => ({ fade: fadeClues, impossible: impossibleLines }), [fadeClues, impossibleLines])

  const stageRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const stage = stageRef.current!
    // The board's cabinet (padding, border, offset shadow) sits inside the stage; CSS owns its size.
    const observer = new ResizeObserver(([entry]) => {
      const chrome = parseFloat(getComputedStyle(stage).getPropertyValue('--cabinet-chrome')) || 0
      const { width, height } = entry!.contentRect
      setAvailable({ width: width - chrome, height: height - chrome })
    })
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])
  const cellSize = available ? fitCellSize(available, puzzle) : 0

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

  // The local check already won; the server only supplies the reveal colors, so failures are ignored.
  useEffect(() => {
    if (!solved) return
    const abort = new AbortController()
    const cells = store.getState().cells.map(c => (c === 'filled' ? 'filled' : 'empty'))
    submitSolve(puzzle.id, { cells }, abort.signal).then(
      res => res.solved && store.setPalette(res.palette),
      () => {},
    )
    return () => abort.abort()
  }, [solved, store, puzzle.id])

  return (
    <main className={styles.play}>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{puzzle.title}</h1>
        <span className={styles.pill}>
          {puzzle.width}×{puzzle.height}
        </span>
        {solved && (
          <span className={styles.solvedPill} role="status">
            Solved!
          </span>
        )}
      </div>
      <div ref={stageRef} className={styles.stage}>
        {cellSize > 0 && (
          <div className={styles.cabinet}>
            <div
              className={styles.board}
              data-revealed={revealed || undefined}
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
          </div>
        )}
      </div>
      {solved ? (
        <div className={styles.dock}>
          <Link to="/" className={styles.linkButton}>
            More puzzles
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      ) : (
        <>
          <div className={styles.dock}>
            <div className={styles.modeToggle} role="group" aria-label="Touch tool">
              {(['fill', 'mark'] as const).map(m => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => store.setMode(m)}>
                  {m === 'fill' ? <i className={styles.fillSwatch} aria-hidden="true" /> : <MarkIcon />}
                  {m === 'fill' ? 'Fill' : 'Mark'}
                </button>
              ))}
            </div>
            <button type="button" aria-label="Undo" disabled={!canUndo} onClick={() => store.undo()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 14 4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
            </button>
            <button type="button" aria-label="Redo" disabled={!canRedo} onClick={() => store.redo()}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="m15 14 5-5-5-5" />
                <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
              </svg>
            </button>
          </div>
          <AssistChips />
        </>
      )}
    </main>
  )
}

function MarkIcon() {
  return (
    <svg viewBox="0 0 10 10" aria-hidden="true" style={{ width: 13, height: 13, strokeWidth: 2.4 }}>
      <path d="M2 2l6 6M8 2l-6 6" />
    </svg>
  )
}
