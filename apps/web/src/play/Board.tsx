import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useSyncExternalStore } from 'react'
import { getSettings, subscribeSettings } from '../settings.ts'
import { type PlayState, type PlayStore, type Pos, type Tool, crosshairOf } from './store.ts'
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
  cellSize: number
  /** Overrides the player's settings, for a Lesson's fixed assists. */
  assists?: BoardAssists | undefined
  /** Cells to outline, for a Lesson step's targets. */
  highlight?: readonly number[] | undefined
  /** A cell to flag as wrong. */
  mistake?: number | null | undefined
}

export function Board({ store, cellSize, assists, highlight, mistake = null }: Props) {
  const { width, height } = store.puzzle
  const options = useRef({ assists, highlight, mistake })
  options.current = { assists, highlight, mistake }
  const redraw = useRef(() => {})
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerId = useRef<number | null>(null)
  const heldKey = useRef<string | null>(null)
  const revealStart = useRef<number | null>(null)
  const disarmContextMenu = useRef<(() => void) | null>(null)

  useEffect(() => () => disarmContextMenu.current?.(), [])

  useEffect(() => {
    const canvas = canvasRef.current!
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
    const darkScheme = matchMedia('(prefers-color-scheme: dark)')
    let frame = 0
    const draw = (now: number) => {
      frame = 0
      const state = store.getState()
      let revealElapsed: number | null = null
      if (state.palette) {
        revealStart.current ??= reducedMotion.matches ? -Infinity : now
        revealElapsed = now - revealStart.current
      }
      const { assists = getSettings(), highlight = [], mistake } = options.current
      paint(canvas, state, width, height, cellSize, {
        crosshair: assists.crosshair ? crosshairOf(state) : null,
        revealElapsed,
        highlight,
        mistake,
      })
      if (revealElapsed !== null && revealElapsed < REVEAL_MS) request()
    }
    const request = () => {
      frame ||= requestAnimationFrame(draw)
    }
    request()
    redraw.current = request
    const unsubscribe = store.subscribe(request)
    const unsubscribeSettings = subscribeSettings(request)
    darkScheme.addEventListener('change', request)
    // Catches devicePixelRatio changes from browser zoom or moving between screens.
    window.addEventListener('resize', request)
    return () => {
      unsubscribe()
      unsubscribeSettings()
      cancelAnimationFrame(frame)
      darkScheme.removeEventListener('change', request)
      window.removeEventListener('resize', request)
    }
  }, [store, width, height, cellSize])

  useEffect(() => redraw.current(), [assists?.crosshair, highlight, mistake])

  const announcement = useSyncExternalStore(store.subscribe, () => {
    const { cursor, cells } = store.getState()
    return `Row ${cursor.row + 1}, column ${cursor.col + 1}, ${cells[cursor.row * width + cursor.col]}`
  })

  const posFrom = (e: PointerEvent): Pos => {
    const rect = e.currentTarget.getBoundingClientRect()
    const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max - 1)
    return {
      row: clamp(Math.floor((e.clientY - rect.top) / cellSize), height),
      col: clamp(Math.floor((e.clientX - rect.left) / cellSize), width),
    }
  }

  // On Windows, contextmenu fires on mouseup at whatever is under the cursor, and pointer capture
  // doesn't retarget it, so a right-drag released off the board would open the menu there.
  // The next pointerdown disarms the block in case no contextmenu arrives.
  const armContextMenuBlock = () => {
    disarmContextMenu.current?.()
    const block = (e: Event) => {
      e.preventDefault()
      disarm()
    }
    const disarm = () => {
      window.removeEventListener('contextmenu', block, true)
      window.removeEventListener('pointerdown', disarm, true)
      disarmContextMenu.current = null
    }
    window.addEventListener('contextmenu', block, true)
    window.addEventListener('pointerdown', disarm, true)
    disarmContextMenu.current = disarm
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (pointerId.current !== null) return
    let tool: Tool
    if (e.pointerType === 'mouse') {
      if (e.button === 0) tool = 'fill'
      else if (e.button === 2) {
        tool = 'mark'
        armContextMenuBlock()
      } else return
    } else {
      tool = store.getState().mode
    }
    // preventDefault suppresses the compat mouse events, which would otherwise focus the canvas.
    e.preventDefault()
    e.currentTarget.focus({ preventScroll: true })
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerId.current = e.pointerId
    store.setHover(null)
    const { lockLine } = assists ?? getSettings()
    const lockAxis = e.pointerType === 'mouse' ? e.shiftKey || lockLine : lockLine
    store.beginStroke(posFrom(e), tool, { lockAxis })
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId === pointerId.current) store.extendStroke(posFrom(e))
    else if (e.pointerType === 'mouse' && pointerId.current === null) store.setHover(posFrom(e))
  }

  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId !== pointerId.current) return
    pointerId.current = null
    store.endStroke()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const key = e.key.toLowerCase()
    const move = moves[key]
    const tool = keyTools[key]
    if (move) {
      store.moveCursor(...move)
    } else if (tool) {
      if (!e.repeat && heldKey.current === null) {
        heldKey.current = key
        store.beginStroke(store.getState().cursor, tool, { lockAxis: false })
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
        role="application"
        aria-label={`Puzzle grid, ${width} by ${height}. Arrow keys or WASD move, hold Z to fill, hold X to mark.`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onLostPointerCapture={onPointerEnd}
        onPointerLeave={() => store.setHover(null)}
        onFocus={() => store.setFocused(true)}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onBlur={onBlur}
        onContextMenu={e => e.preventDefault()}
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
  mistake: number | null
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
  cell: number,
  { crosshair, revealElapsed, highlight, mistake }: PaintOptions,
) {
  const dpr = window.devicePixelRatio || 1
  const cssWidth = width * cell
  const cssHeight = height * cell
  const pxWidth = Math.round(cssWidth * dpr)
  const pxHeight = Math.round(cssHeight * dpr)
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
  ctx.fillRect(0, 0, cssWidth, cssHeight)

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
  state.cells.forEach((c, i) => {
    const col = i % width
    const row = Math.floor(i / width)
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
  })

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
    if (mistake !== null) {
      ctx.strokeStyle = color('--board-mistake')
      ctx.strokeRect((mistake % width) * cell + 1.5, Math.floor(mistake / width) * cell + 1.5, cell - 3, cell - 3)
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

  if (state.focused && !state.solved) {
    const { row, col } = state.cursor
    ctx.strokeStyle = color('--board-cursor')
    ctx.lineWidth = 3
    ctx.strokeRect(col * cell + 2, row * cell + 2, cell - 4, cell - 4)
  }
}
