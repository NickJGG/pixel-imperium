import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getRouteApi } from '@tanstack/react-router'
import type { PuzzleClues } from '@pixel-imperium/protocol'
import { submitSolve } from '../api.ts'
import { Board } from './Board.tsx'
import { ColClues, RowClues } from './Clues.tsx'
import { CLUE_SLOT, fitCellSize } from './layout.ts'
import { type PlayState, PlayStore } from './store.ts'
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
  const [store] = useState(() => new PlayStore(puzzle))
  const canUndo = useStoreValue(store, s => s.canUndo)
  const canRedo = useStoreValue(store, s => s.canRedo)
  const mode = useStoreValue(store, s => s.mode)
  const solved = useStoreValue(store, s => s.solved)

  const stageRef = useRef<HTMLDivElement>(null)
  const [available, setAvailable] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      setAvailable({ width, height })
    })
    observer.observe(stageRef.current!)
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
      <div className={styles.bar}>
        <h1 className={styles.title}>
          {puzzle.title}{' '}
          <span className={styles.size}>
            {puzzle.width}×{puzzle.height}
          </span>
        </h1>
        <div className={styles.tools}>
          <div className={styles.modeToggle} role="group" aria-label="Touch tool">
            {(['fill', 'mark'] as const).map(m => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => store.setMode(m)}>
                {m === 'fill' ? 'Fill' : 'Mark'}
              </button>
            ))}
          </div>
          <button type="button" disabled={!canUndo || solved} onClick={() => store.undo()}>
            Undo
          </button>
          <button type="button" disabled={!canRedo || solved} onClick={() => store.redo()}>
            Redo
          </button>
        </div>
      </div>
      {solved && (
        <p className={styles.solved} role="status">
          Solved!
        </p>
      )}
      <div ref={stageRef} className={styles.stage}>
        {cellSize > 0 && (
          <div
            className={styles.board}
            style={
              {
                '--cell': `${cellSize}px`,
                '--clue-slot': `${cellSize * CLUE_SLOT}px`,
              } as CSSProperties
            }
          >
            <div />
            <ColClues cols={puzzle.clues.cols} />
            <RowClues rows={puzzle.clues.rows} />
            <Board store={store} cellSize={cellSize} />
          </div>
        )}
      </div>
    </main>
  )
}
