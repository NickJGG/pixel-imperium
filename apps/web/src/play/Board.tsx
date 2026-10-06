import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useSyncExternalStore } from 'react'
import type { PlayState, PlayStore, Pos, Tool } from './store.ts'
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

export function Board({ store, cellSize }: { store: PlayStore; cellSize: number }) {
  const { width, height } = store.puzzle
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pointerId = useRef<number | null>(null)
  const heldKey = useRef<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    let frame = 0
    const draw = () => {
      frame = 0
      paint(canvas, store.getState(), width, height, cellSize, document.activeElement === canvas)
    }
    const request = () => {
      frame ||= requestAnimationFrame(draw)
    }
    request()
    const unsubscribe = store.subscribe(request)
    canvas.addEventListener('focus', request)
    canvas.addEventListener('blur', request)
    // Catches devicePixelRatio changes from browser zoom or moving between screens.
    window.addEventListener('resize', request)
    return () => {
      unsubscribe()
      cancelAnimationFrame(frame)
      canvas.removeEventListener('focus', request)
      canvas.removeEventListener('blur', request)
      window.removeEventListener('resize', request)
    }
  }, [store, width, height, cellSize])

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

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (pointerId.current !== null) return
    let tool: Tool
    if (e.pointerType === 'mouse') {
      if (e.button === 0) tool = 'fill'
      else if (e.button === 2) tool = 'mark'
      else return
    } else {
      tool = store.getState().mode
    }
    // preventDefault suppresses the compat mouse events, which would otherwise focus the canvas.
    e.preventDefault()
    e.currentTarget.focus({ preventScroll: true })
    e.currentTarget.setPointerCapture(e.pointerId)
    pointerId.current = e.pointerId
    store.beginStroke(posFrom(e), tool, { lockAxis: true })
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerId === pointerId.current) store.extendStroke(posFrom(e))
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

function paint(
  canvas: HTMLCanvasElement,
  state: PlayState,
  width: number,
  height: number,
  cell: number,
  focused: boolean,
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

  ctx.strokeStyle = mark
  ctx.lineWidth = Math.max(1, cell * 0.08)
  ctx.lineCap = 'round'
  const inset = cell * 0.3
  state.cells.forEach((c, i) => {
    const x = (i % width) * cell
    const y = Math.floor(i / width) * cell
    if (c === 'filled') {
      ctx.fillStyle = state.palette?.[i] ?? fill
      ctx.fillRect(x, y, cell, cell)
    } else if (c === 'marked' && !state.palette) {
      ctx.beginPath()
      ctx.moveTo(x + inset, y + inset)
      ctx.lineTo(x + cell - inset, y + cell - inset)
      ctx.moveTo(x + cell - inset, y + inset)
      ctx.lineTo(x + inset, y + cell - inset)
      ctx.stroke()
    }
  })

  // Lines straddle cell boundaries; every fifth is thicker, and the border sits fully inside.
  const line = color('--board-line')
  const major = color('--board-line-major')
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
  ctx.strokeStyle = major
  ctx.lineWidth = 2
  ctx.strokeRect(1, 1, cssWidth - 2, cssHeight - 2)

  if (focused && !state.solved) {
    const { row, col } = state.cursor
    ctx.strokeStyle = color('--board-cursor')
    ctx.lineWidth = 2
    ctx.strokeRect(col * cell + 1.5, row * cell + 1.5, cell - 3, cell - 3)
  }
}
