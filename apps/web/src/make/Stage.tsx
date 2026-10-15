import { type CSSProperties, type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import type { Clues } from '@pixel-imperium/nonogram'
import { ColClues, RowClues } from '../play/Clues.tsx'
import { boardTracks, fitCellSize } from '../play/layout.ts'
import type { LineHint } from '../play/line-hints.ts'
import playStyles from '../play/Play.module.css'

interface Picture {
  width: number
  height: number
  clues: Clues
}

const NO_HINTS: readonly LineHint[] = []
const NO_ASSISTS = { fade: false, impossible: false }

/** Play's stage, measured; `children` gets the cell size that fits `puzzle`, once there's room to know it. */
export function Stage({ puzzle, children }: { puzzle: Picture; children: (cellSize: number) => ReactNode }) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry!.contentRect
      setStage({ width, height })
    })
    observer.observe(stageRef.current!)
    return () => observer.disconnect()
  }, [])
  return (
    <div className={playStyles.surface}>
      <div ref={stageRef} className={playStyles.stage}>
        {stage.width > 0 && children(fitCellSize(stage, puzzle))}
      </div>
    </div>
  )
}

/** The drawing (`children`, an EditCanvas) under its live clues, without Play's hints or assists. */
export function Drawing({ puzzle, cellSize, children }: { puzzle: Picture; cellSize: number; children: ReactNode }) {
  return (
    <div
      className={playStyles.board}
      style={
        {
          ...boardTracks(puzzle, cellSize),
          '--cell': `${cellSize}px`,
          '--pan-x': '0px',
          '--pan-y': '0px',
        } as CSSProperties
      }
    >
      <div />
      <ColClues lines={puzzle.clues.cols} hints={NO_HINTS} active={null} assists={NO_ASSISTS} />
      <RowClues lines={puzzle.clues.rows} hints={NO_HINTS} active={null} assists={NO_ASSISTS} />
      {children}
    </div>
  )
}
