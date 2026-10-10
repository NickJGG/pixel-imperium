import { type CSSProperties, useSyncExternalStore } from 'react'
import type { Cell } from '@pixel-imperium/nonogram'
import type { HintResponse } from '@pixel-imperium/protocol'
import { cellHintText } from './HintButton.tsx'
import { type BoardView, visibleRange } from './viewport.ts'
import cellTag from './CellTag.module.css'
import styles from './Play.module.css'

interface Props {
  hint: HintResponse
  cells: readonly Cell[]
  view: BoardView
}

/**
 * The hint's note, pinned beside its cell inside the board grid; the canvas rings the cell. CSS
 * places it from the board's view vars, so zooms and pans move it without a render. It opens
 * towards the roomier side of the fit box and hides while its cell is out of view.
 */
export function HintTag({ hint, cells, view }: Props) {
  const { width } = view.grid
  const row = Math.floor(hint.index / width)
  const col = hint.index % width
  const place = useSyncExternalStore(view.subscribe, () => placeOf(view, row, col))
  if (!place) return null
  return (
    <p
      className={`${cellTag.bubble} ${cellTag.tag} ${styles.hintTag}`}
      data-tone={hint.kind === 'reveal' ? 'aside' : undefined}
      data-side={place.endsWith('right') ? 'right' : 'left'}
      data-rise={place.startsWith('rise') || undefined}
      style={{ '--hint-row': row, '--hint-col': col } as CSSProperties}
      role="status"
    >
      {cellHintText(hint, cells)}
    </p>
  )
}

/** A string, so the snapshot only changes when the tag has to flip or hide. */
function placeOf(view: BoardView, row: number, col: number): string | null {
  const { view: v, fitCell, grid } = view
  const { row0, row1, col0, col1 } = visibleRange(v, fitCell, grid)
  if (row < row0 || row > row1 || col < col0 || col > col1) return null
  const right = v.panX + (col + 0.5) * v.cell < (grid.width * fitCell) / 2
  const rise = v.panY + (row + 0.5) * v.cell > (grid.height * fitCell) / 2
  return `${rise ? 'rise' : 'drop'} ${right ? 'right' : 'left'}`
}
