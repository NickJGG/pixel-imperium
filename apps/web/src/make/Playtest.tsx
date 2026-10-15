import { type CSSProperties, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { cluesFromSolution } from '@pixel-imperium/nonogram'
import { useSettings } from '../settings.ts'
import { play } from '../sound.ts'
import { Board } from '../play/Board.tsx'
import { ColClues, RowClues } from '../play/Clues.tsx'
import { useBoardGestures } from '../play/gestures.ts'
import { boardTracks } from '../play/layout.ts'
import { createLineHints } from '../play/line-hints.ts'
import { PlaytestStorage } from '../play/playtest-storage.ts'
import { type PlayState, PlayStore, crosshairOf } from '../play/store.ts'
import { useUndoKeys } from '../play/useUndoKeys.ts'
import { BoardView } from '../play/viewport.ts'
import type { Draft } from './draft.ts'
import playStyles from '../play/Play.module.css'

export function playtestStore(draft: Draft): PlayStore {
  const { width, height } = draft
  const clues = cluesFromSolution(width, height, draft.cells.map(c => c !== null))
  return new PlayStore({ id: 'make-playtest', width, height, clues }, { storage: new PlaytestStorage() })
}

export function useStoreValue<T>(store: PlayStore, select: (s: PlayState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(store.getState()))
}

/** The draft on the real board, solved from empty with the player's own assists; a solve reveals its colors. */
export function PlaytestBoard({ store, draft, cellSize }: { store: PlayStore; draft: Draft; cellSize: number }) {
  const { puzzle } = store
  const settings = useSettings()
  const cells = useStoreValue(store, s => s.cells)
  const solved = useStoreValue(store, s => s.solved)
  const palette = useStoreValue(store, s => s.palette)
  const crossRow = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.row ?? null) : null))
  const crossCol = useStoreValue(store, s => (settings.crosshair ? (crosshairOf(s)?.col ?? null) : null))

  const [lineHints] = useState(() => createLineHints(puzzle))
  const hints = useMemo(() => lineHints(cells), [lineHints, cells])
  const { fadeClues, impossibleLines } = settings
  const clueAssists = useMemo(() => ({ fade: fadeClues, impossible: impossibleLines }), [fadeClues, impossibleLines])

  useEffect(() => {
    if (!solved || store.getState().palette) return
    store.setPalette(draft.cells)
    play('pop')
  }, [solved, store, draft])

  useUndoKeys(store)
  const [boardView] = useState(() => new BoardView(puzzle, false))
  const boardRef = useBoardGestures(store, boardView)

  return (
    <div
      ref={boardRef}
      className={playStyles.board}
      data-revealed={palette !== null || undefined}
      style={boardTracks(puzzle, cellSize) as CSSProperties}
    >
      <div />
      <ColClues lines={puzzle.clues.cols} hints={hints.cols} active={crossCol} assists={clueAssists} />
      <RowClues lines={puzzle.clues.rows} hints={hints.rows} active={crossRow} assists={clueAssists} />
      <Board store={store} cellSize={cellSize} view={boardView} />
    </div>
  )
}
