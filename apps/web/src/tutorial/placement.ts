/** Where a beat's callout sits around a Lesson board, which never zooms, so cell positions are fixed. */

const GAP = 14
const ROW_WIDTH = 300
const SIDE_WIDTH = 240
const SIDE_ROOM = 170

export interface BoardBox {
  width: number
  height: number
  cell: number
  /** Depth of the row clues, left of the grid. */
  rowDepth: number
  /** Depth of the column clues, above the grid. */
  colDepth: number
}

export interface CalloutAt {
  /** The side of its line the callout sits on; its pointer faces the other way. */
  side: 'below' | 'above' | 'right' | 'left'
  /** Pixels from the board's left edge. */
  left: number
  width: number
  /** Pixels from the board's top edge, or for `above`, from its bottom edge. */
  top?: number
  bottom?: number
}

export interface PlaceInput {
  board: BoardBox
  lines: { rows?: number[]; cols?: number[] }
  whole: boolean
  /** The phone layout, where the coach stacks under the board. */
  stacked: boolean
  stage: { width: number }
  /** The board's left edge within the stage. */
  boardLeft: number
}

/**
 * Row beats sit under the row in the top half, else over it, left-aligned. Column beats sit beside
 * the board where there's room. Everything else docks under the board.
 */
export function placeCallout({ board, lines, whole, stacked, stage, boardLeft }: PlaceInput): CalloutAt | 'dock' {
  const { rows = [], cols = [] } = lines
  if (stacked || whole) return 'dock'
  const { width, height, cell, rowDepth, colDepth } = board
  const boardWidth = rowDepth + width * cell
  const boardHeight = colDepth + height * cell
  if (rows.length > 0) {
    const lo = Math.min(...rows)
    const hi = Math.max(...rows)
    const w = Math.min(ROW_WIDTH, boardWidth)
    return hi < height / 2
      ? { side: 'below', left: 0, width: w, top: colDepth + (hi + 1) * cell + GAP }
      : { side: 'above', left: 0, width: w, bottom: boardHeight - (colDepth + lo * cell) + GAP }
  }
  if (cols.length === 0) return 'dock'
  const right = stage.width - boardLeft - boardWidth - GAP
  if (right >= SIDE_ROOM) return { side: 'right', left: boardWidth + GAP, width: Math.min(SIDE_WIDTH, right), top: colDepth }
  const left = boardLeft - GAP
  if (left >= SIDE_ROOM) {
    const w = Math.min(SIDE_WIDTH, left)
    return { side: 'left', left: -GAP - w, width: w, top: colDepth }
  }
  return 'dock'
}
