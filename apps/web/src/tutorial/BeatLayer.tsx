/**
 * The current beat drawn over a Lesson board: spotlight, ghosts, both-ways marks and brackets, the
 * callout by its line, and a tag by a cell the coach has something to say about. The layer sits
 * over the board grid in the same pixel geometry as its tracks; only the callout takes the pointer.
 * `Dock` holds the callout and tag under the board when they don't float.
 */
import type { CSSProperties } from 'react'
import type { BoardFlag } from '../play/Board.tsx'
import type { Beat, Draw } from './lessons.ts'
import type { BoardBox, CalloutAt } from './placement.ts'
import { rich } from './rich.tsx'
import cellTag from '../play/CellTag.module.css'
import styles from './BeatLayer.module.css'

const TAG_WIDTH = 210

/** A note pinned to a cell. Hints share the aside's blue. */
export interface Tag {
  cell: number
  tone: BoardFlag['tone']
  text: string
}

export interface BeatView {
  /** Changes with the beat, so its drawings and pop-in don't restart on every edit. */
  key: string
  beat: Beat
  index: number
  count: number
  talk: boolean
  onNext: () => void
}

interface LayerProps {
  board: BoardBox
  view: BeatView
  /** The lines the beat is about; empty for a whole-board beat. */
  lines: { rows: number[]; cols: number[] }
  at: CalloutAt | 'dock'
  /** `null` when it's docked or there's none. */
  tag: Tag | null
}

export function BeatLayer({ board, view, lines, at, tag }: LayerProps) {
  const { key, beat, talk } = view
  return (
    <div className={styles.layer}>
      <div key={key} className={styles.drawings} aria-hidden="true">
        {talk && <Spotlight board={board} lines={lines} />}
        {beat.draw?.map((d, i) => <Drawing key={i} board={board} draw={d} />)}
      </div>
      {at !== 'dock' && (
        <div className={styles.callout} data-side={at.side} style={calloutStyle(at)} aria-live="polite">
          <BeatBody view={view} />
        </div>
      )}
      {tag && <FloatTag board={board} tag={tag} />}
    </div>
  )
}

export function Dock({ view, tag }: { view: BeatView | null; tag: Tag | null }) {
  return (
    <div className={styles.dock}>
      {tag && (
        <p className={cellTag.bubble} data-tone={tag.tone} role="status">
          {rich(tag.text)}
        </p>
      )}
      {view && (
        <div className={styles.dockBeat} aria-live="polite">
          <BeatBody view={view} />
        </div>
      )}
    </div>
  )
}

const ANCHORS = { assists: 'the assists', hint: 'the Hint button' }

function BeatBody({ view: { key, beat, index, count, talk, onNext } }: { view: BeatView }) {
  return (
    <div key={key} className={styles.pop}>
      <p>{rich(beat.text)}</p>
      {beat.anchor && <span className={styles.pointsDown}>↓ {ANCHORS[beat.anchor]}, below</span>}
      <div className={styles.beatFoot}>
        <span>
          {index + 1} / {count}
        </span>
        {talk ? (
          <button type="button" data-variant="primary" onClick={onNext}>
            Next →
          </button>
        ) : (
          <span>Your turn</span>
        )}
      </div>
    </div>
  )
}

const px = (n: number) => `${n}px`

function calloutStyle({ left, width, top, bottom }: CalloutAt): CSSProperties {
  return { left: px(left), width: px(width), top: top === undefined ? undefined : px(top), bottom: bottom === undefined ? undefined : px(bottom) }
}

/** A box over cells `from`–`to` of a line, grown by `grow` on every side. */
function lineBox({ cell, rowDepth, colDepth }: BoardBox, line: { row?: number; col?: number }, from: number, to: number, grow: number) {
  const along = from * cell - grow
  const length = (to - from + 1) * cell + 2 * grow
  return line.row !== undefined
    ? { left: rowDepth + along, top: colDepth + line.row * cell - grow, width: length, height: cell + 2 * grow }
    : { left: rowDepth + line.col! * cell - grow, top: colDepth + along, width: cell + 2 * grow, height: length }
}

const boxStyle = (b: { left: number; top: number; width: number; height: number }): CSSProperties => ({
  left: px(b.left),
  top: px(b.top),
  width: px(b.width),
  height: px(b.height),
})

function Spotlight({ board, lines }: { board: BoardBox; lines: LayerProps['lines'] }) {
  const { width, height, cell, rowDepth, colDepth } = board
  if (lines.rows.length === 0 && lines.cols.length === 0) return null
  const dim = []
  for (let r = 0; r < height; r++) {
    if (lines.rows.includes(r)) continue
    for (let c = 0; c < width; c++) {
      if (!lines.cols.includes(c)) dim.push(<rect key={r * width + c} x={c * cell} y={r * cell} width={cell} height={cell} />)
    }
  }
  return (
    <svg
      className={styles.spotlight}
      style={{ left: px(rowDepth), top: px(colDepth) }}
      width={width * cell}
      height={height * cell}
      shapeRendering="crispEdges"
    >
      {dim}
    </svg>
  )
}

function Drawing({ board, draw }: { board: BoardBox; draw: Draw }) {
  const { cell } = board
  if ('ghost' in draw) {
    const { at, len, tone } = draw.ghost
    const [from, to] = at
    const label = { fontSize: px(Math.round(cell * 0.42)) }
    const shift = px((to - from) * cell)
    const slide = { '--dx': draw.ghost.row !== undefined ? shift : '0px', '--dy': draw.ghost.row !== undefined ? '0px' : shift }
    return (
      <>
        <div
          className={styles.ghost}
          data-tone={tone}
          data-sliding={from !== to || undefined}
          style={{ ...boxStyle(lineBox(board, draw.ghost, from, from + len - 1, -3)), ...label, ...slide }}
        >
          {len}
        </div>
        {from !== to && (
          <div className={`${styles.ghost} ${styles.end}`} data-tone={tone} style={{ ...boxStyle(lineBox(board, draw.ghost, to, to + len - 1, -3)), ...label }}>
            {len}
          </div>
        )}
      </>
    )
  }
  if ('both' in draw) {
    const { from, to } = draw.both
    return <div className={styles.both} style={boxStyle(lineBox(board, draw.both, from, to, 2))} />
  }
  const { from, to, label, tone, row } = draw.bracket
  const span = lineBox(board, draw.bracket, from, to, -4)
  // Just past the line's far edge, open towards its cells.
  const at = row !== undefined ? { ...span, top: span.top + cell - 2, height: 10 } : { ...span, left: span.left + cell - 2, width: 10 }
  return (
    <div className={styles.bracket} data-axis={row !== undefined ? 'row' : 'col'} data-tone={tone} style={boxStyle(at)}>
      <span>{label}</span>
    </div>
  )
}

function FloatTag({ board, tag }: { board: BoardBox; tag: Tag }) {
  const { width, cell, rowDepth, colDepth } = board
  const r = Math.floor(tag.cell / width)
  const c = tag.cell % width
  const right = c < width / 2
  const style = {
    left: px(right ? rowDepth + (c + 1) * cell + 10 : rowDepth + c * cell - 10 - TAG_WIDTH),
    top: px(colDepth + r * cell + cell / 2 - 20),
    width: px(TAG_WIDTH),
  }
  return (
    <p className={`${cellTag.bubble} ${cellTag.tag}`} data-tone={tag.tone} data-side={right ? 'right' : 'left'} style={style} role="status">
      {rich(tag.text)}
    </p>
  )
}
