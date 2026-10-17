import { type KeyboardEvent, useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { usePadBoard } from '../pad/usePadBoard.ts'
import { PING_MS, type Presence } from '../coop/session.ts'
import { seatColor } from '../coop/seats.ts'
import { getSettings, subscribeSettings } from '../settings.ts'
import { move, startStroke } from './board-actions.ts'
import { type PlayState, type PlayStore, type Pos, type Tool, crosshairOf } from './store.ts'
import { type BoardView, type View, visibleRange } from './viewport.ts'
import styles from './Play.module.css'

const moves: Record<string, [number, number]> = {
  arrowup: [-1, 0],
  w: [-1, 0],
  arrowdown: [1, 0],
  s: [1, 0],
  arrowleft: [0, -1],
  a: [0, -1],
  arrowright: [0, 1],
  d: [0, 1],
}

const keyTools: Record<string, Tool> = { z: 'fill', x: 'mark' }

/** The reveal sweeps diagonally from the top-left; each cell then fades to its color. */
const REVEAL_SWEEP_MS = 550
const REVEAL_CELL_MS = 300
export const REVEAL_MS = REVEAL_SWEEP_MS + REVEAL_CELL_MS

export interface BoardAssists {
  crosshair: boolean
  lockLine: boolean
}

interface Props {
  store: PlayStore
  /** The fit cell size; the canvas stays this size while `view` zooms inside it. */
  cellSize: number
  view: BoardView
  /** Overrides the player's settings, for a Lesson's fixed assists. */
  assists?: BoardAssists | undefined
  /** Cells to outline, for a Lesson step's targets. */
  highlight?: readonly number[] | undefined
  /** A cell to ring: wrong, a guess, or true but beside the point. */
  flag?: BoardFlag | null | undefined
  /** Set during a Lesson's talk beat, when a controller's A advances it. */
  onTalkNext?: (() => void) | undefined
  /** A co-op's partners and Pings. */
  presence?: PresenceSource | undefined
}

export interface PresenceSource {
  getPresence(): Presence
  subscribePresence(listener: () => void): () => void
}

const NO_PRESENCE: Presence = { partners: [], pings: [] }

export interface BoardFlag {
  index: number
  tone: 'mistake' | 'guess' | 'aside'
}

export function Board({ store, cellSize, view, assists, highlight, flag = null, onTalkNext, presence }: Props) {
  const { width, height } = store.puzzle
  const options = useRef({ assists, highlight, flag })
  options.current = { assists, highlight, flag }
  const redraw = useRef(() => {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const heldKey = useRef<string | null>(null)
  const revealStart = useRef<number | null>(null)

  useLayoutEffect(() => view.setFit(cellSize), [view, cellSize])
  usePadBoard(canvasRef, { store, view, assists, onTalkNext })

  useEffect(() => {
    const canvas = canvasRef.current!
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    const darkScheme = matchMedia('(prefers-color-scheme: dark)')
    let frame = 0
    const draw = (now: number) => {
      frame = 0
      const state = store.getState()
      let revealElapsed: number | null = null
      // A solve while zoomed glides back to fit first (PlayPage); the reveal waits for it.
      if (state.palette && !view.zoomed && !view.animating) {
        revealStart.current ??= reducedMotion.matches ? -Infinity : now
        revealElapsed = now - revealStart.current
      }
      const { assists = getSettings(), highlight = [], flag } = options.current
      const { partners, pings } = presence?.getPresence() ?? NO_PRESENCE
      const live = pings.flatMap(p => (now - p.at < PING_MS ? [{ ...p, t: Math.max(0, now - p.at) / PING_MS }] : []))
      paint(canvas, state, width, height, cellSize, view.view, {
        crosshair: assists.crosshair ? crosshairOf(state) : null,
        revealElapsed,
        highlight,
        flag,
        partners,
        pings: live,
      })
      if ((revealElapsed !== null && revealElapsed < REVEAL_MS) || live.length > 0) request()
    }
    const request = () => {
      frame ||= requestAnimationFrame(draw)
    }
    request()
    redraw.current = request
    const unsubscribe = store.subscribe(request)
    const unsubscribeView = view.subscribe(request)
    const unsubscribeSettings = subscribeSettings(request)
    const unsubscribePresence = presence?.subscribePresence(request)
    darkScheme.addEventListener('change', request)
    // Catches devicePixelRatio changes from browser zoom or moving between screens.
    window.addEventListener('resize', request)
    return () => {
      unsubscribe()
      unsubscribeView()
      unsubscribeSettings()
      unsubscribePresence?.()
      cancelAnimationFrame(frame)
      darkScheme.removeEventListener('change', request)
      window.removeEventListener('resize', request)
    }
  }, [store, view, width, height, cellSize, presence])

  useEffect(() => redraw.current(), [assists?.crosshair, highlight, flag])

  useEffect(() => {
    let { hint } = store.getState()
    return store.subscribe(() => {
      const next = store.getState().hint
      if (next && next !== hint) view.reveal({ row: Math.floor(next.index / width), col: next.index % width })
      hint = next
    })
  }, [store, view, width])

  const solved = useSyncExternalStore(store.subscribe, () => store.getState().solved)
  const announcement = useSyncExternalStore(store.subscribe, () => {
    const { cursor, cells } = store.getState()
    return `Row ${cursor.row + 1}, column ${cursor.col + 1}, ${cells[cursor.row * width + cursor.col]}`
  })

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const key = e.key.toLowerCase()
    const delta = moves[key]
    const tool = keyTools[key]
    if (delta) {
      move(store, view, ...delta)
    } else if (tool) {
      if (!e.repeat && heldKey.current === null) {
        heldKey.current = key
        startStroke(store, view, tool, false)
      }
    } else {
      return
    }
    e.preventDefault()
  }

  const onKeyUp = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.key.toLowerCase() !== heldKey.current) return
    heldKey.current = null
    store.endStroke()
  }

  const onBlur = () => {
    store.setFocused(false)
    if (heldKey.current === null) return
    heldKey.current = null
    store.endStroke()
  }

  return (
    <>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        style={{ width: width * cellSize, height: height * cellSize }}
        tabIndex={0}
        data-pad-default={!solved || undefined}
        data-pad-board
        role="application"
        aria-label={`Puzzle grid, ${width} by ${height}. Arrow keys or WASD move, hold Z to fill, hold X to mark.`}
        onFocus={() => store.setFocused(true)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={onBlur}
      />
      <div className={styles.visuallyHidden} aria-live="polite">
        {announcement}
      </div>
    </>
  )
}

interface PaintOptions {
  crosshair: Pos | null
  /** Milliseconds since the color reveal began, `null` before a confirmed solve. */
  revealElapsed: number | null
  highlight: readonly number[]
  flag: BoardFlag | null
  partners: readonly { index: number; seat: number; initial: string }[]
  /** `t` runs 0 to 1 over the Ping. */
  pings: readonly { index: number; seat: number; initial: string; t: number }[]
}

const smoothstep = (t: number) => {
  const x = Math.min(Math.max(t, 0), 1)
  return x * x * (3 - 2 * x)
}

function paint(
  canvas: HTMLCanvasElement,
  state: PlayState,
  width: number,
  height: number,
  fitCell: number,
  view: View,
  { crosshair, revealElapsed, highlight, flag, partners, pings }: PaintOptions,
) {
  const dpr = window.devicePixelRatio || 1
  const boxWidth = width * fitCell
  const boxHeight = height * fitCell
  const pxWidth = Math.round(boxWidth * dpr)
  const pxHeight = Math.round(boxHeight * dpr)
  if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
    canvas.width = pxWidth
    canvas.height = pxHeight
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

  const css = getComputedStyle(canvas)
  const color = (name: string) => css.getPropertyValue(name).trim()
  const fill = color('--board-fill')
  const mark = color('--board-mark')

  ctx.fillStyle = color('--board-bg')
  ctx.fillRect(0, 0, boxWidth, boxHeight)

  // From here on, coordinates are the whole zoomed grid's; only the visible cells get drawn.
  ctx.translate(view.panX, view.panY)
  const { cell } = view
  const cssWidth = width * cell
  const cssHeight = height * cell
  const { row0, row1, col0, col1 } = visibleRange(view, fitCell, { width, height })

  if (crosshair) {
    ctx.fillStyle = color('--board-crosshair')
    ctx.fillRect(0, crosshair.row * cell, cssWidth, cell)
    ctx.fillRect(crosshair.col * cell, 0, cell, cssHeight)
  }

  const lastDiagonal = Math.max(1, width + height - 2)
  const revealAt = (row: number, col: number) =>
    revealElapsed === null
      ? 0
      : smoothstep((revealElapsed - ((row + col) / lastDiagonal) * REVEAL_SWEEP_MS) / REVEAL_CELL_MS)

  ctx.strokeStyle = mark
  ctx.lineWidth = Math.max(1, cell * 0.08)
  ctx.lineCap = 'round'
  const inset = cell * 0.3
  for (let row = row0; row <= row1; row++) {
    for (let col = col0; col <= col1; col++) {
      const i = row * width + col
      const c = state.cells[i]
      const x = col * cell
      const y = row * cell
      const t = revealAt(row, col)
      if (c === 'filled') {
        ctx.fillStyle = fill
        ctx.fillRect(x, y, cell, cell)
        const revealed = state.palette?.[i]
        if (revealed && t > 0) {
          ctx.globalAlpha = t
          ctx.fillStyle = revealed
          ctx.fillRect(x, y, cell, cell)
          ctx.globalAlpha = 1
        }
      } else if (c === 'marked' && t < 1) {
        ctx.globalAlpha = 1 - t
        ctx.beginPath()
        ctx.moveTo(x + inset, y + inset)
        ctx.lineTo(x + cell - inset, y + cell - inset)
        ctx.moveTo(x + cell - inset, y + inset)
        ctx.lineTo(x + inset, y + cell - inset)
        ctx.stroke()
        ctx.globalAlpha = 1
      }
    }
  }

  // Lines straddle cell boundaries; every fifth is thicker, and the border sits fully inside.
  // Interior lines fade out during the reveal so the picture reads as one image.
  const line = color('--board-line')
  const major = color('--board-line-major')
  ctx.globalAlpha = revealElapsed === null ? 1 : 1 - smoothstep(revealElapsed / REVEAL_MS)
  for (let c = 1; c < width; c++) {
    const thick = c % 5 === 0
    ctx.fillStyle = thick ? major : line
    ctx.fillRect(c * cell - (thick ? 1 : 0.5), 0, thick ? 2 : 1, cssHeight)
  }
  for (let r = 1; r < height; r++) {
    const thick = r % 5 === 0
    ctx.fillStyle = thick ? major : line
    ctx.fillRect(0, r * cell - (thick ? 1 : 0.5), cssWidth, thick ? 2 : 1)
  }
  ctx.globalAlpha = 1
  ctx.strokeStyle = color('--board-border')
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, cssWidth - 3, cssHeight - 3)

  if (!state.solved) {
    ctx.strokeStyle = color('--board-target')
    ctx.lineWidth = 3
    ctx.globalAlpha = 0.75
    for (const i of highlight) ctx.strokeRect((i % width) * cell + 1.5, Math.floor(i / width) * cell + 1.5, cell - 3, cell - 3)
    ctx.globalAlpha = 1
    if (flag !== null) {
      ctx.strokeStyle = color(`--board-${flag.tone}`)
      ctx.strokeRect((flag.index % width) * cell + 1.5, Math.floor(flag.index / width) * cell + 1.5, cell - 3, cell - 3)
    }
  }

  if (state.hint && !state.solved) {
    const x = (state.hint.index % width) * cell
    const y = Math.floor(state.hint.index / width) * cell
    ctx.strokeStyle = ctx.fillStyle = color(state.hint.kind === 'mistake' ? '--board-mistake' : '--board-reveal')
    ctx.globalAlpha = 0.35
    ctx.fillRect(x, y, cell, cell)
    ctx.globalAlpha = 1
    ctx.lineWidth = 4
    ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4)
  }

  const tag = (x: number, y: number, seat: number, initial: string) => {
    const r = Math.max(6, cell * 0.2)
    ctx.fillStyle = color(seatColor(seat))
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = color('--board-bg')
    ctx.font = `700 ${Math.round(r * 1.25)}px system-ui, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(initial, x, y + r * 0.06)
  }

  if (!state.solved) {
    ctx.lineWidth = 3
    for (const { index, seat, initial } of partners) {
      const x = (index % width) * cell
      const y = Math.floor(index / width) * cell
      ctx.strokeStyle = color(seatColor(seat))
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4)
      tag(x + 2, y + 2, seat, initial)
    }
  }

  for (const { index, seat, initial, t } of pings) {
    const cx = (index % width) * cell + cell / 2
    const cy = Math.floor(index / width) * cell + cell / 2
    ctx.strokeStyle = color(seatColor(seat))
    ctx.lineWidth = 3
    // Two rings ripple out from the cell, the second half a beat behind.
    for (const lag of [0, 0.35]) {
      const k = (t - lag) / (1 - lag)
      if (k <= 0) continue
      ctx.globalAlpha = 1 - k
      ctx.beginPath()
      ctx.arc(cx, cy, cell * (0.4 + 1.2 * k), 0, Math.PI * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1 - t
    tag(cx + cell / 2 - 2, cy - cell / 2 + 2, seat, initial)
    ctx.globalAlpha = 1
  }

  if (state.focused && !state.solved) {
    const { row, col } = state.cursor
    ctx.strokeStyle = color('--board-cursor')
    ctx.lineWidth = 3
    ctx.strokeRect(col * cell + 2, row * cell + 2, cell - 4, cell - 4)
  }
}
