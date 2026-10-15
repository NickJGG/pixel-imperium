import { type PointerEvent, useEffect, useRef } from 'react'
import { subscribeSettings } from '../settings.ts'
import { type Draft, type Pos, fill, line, pick, rect } from './draft.ts'
import { beginStroke, endStroke, getDraft, strokeStart, strokeTo } from './draft-store.ts'
import playStyles from '../play/Play.module.css'

export type Tool = 'pencil' | 'fill' | 'pick' | 'line' | 'rect'

interface Props {
  draft: Draft
  cellSize: number
  tool: Tool
  /** What a left drag paints; `null` is empty. */
  color: string | null
  mirror: boolean
  /** Cells to hatch, where the checks find the clues don't settle the picture. */
  stuck: readonly number[]
  onPick: (color: string | null) => void
}

interface Drag {
  id: number
  start: Pos
  last: Pos
  color: string | null
}

/** The draft's cells in their colors, painted with the left button and emptied with the right. */
export function EditCanvas({ draft, cellSize, tool, color, mirror, stuck, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drag = useRef<Drag | null>(null)
  const hover = useRef<Pos | null>(null)
  const redraw = useRef(() => {})
  const props = useRef({ tool, color, mirror, onPick })
  props.current = { tool, color, mirror, onPick }

  useEffect(() => {
    const canvas = canvasRef.current!
    const darkScheme = matchMedia('(prefers-color-scheme: dark)')
    let frame = 0
    const request = () => {
      frame ||= requestAnimationFrame(() => {
        frame = 0
        paint(canvas, draft, cellSize, mirror, stuck, hover.current)
      })
    }
    request()
    redraw.current = request
    const unsubscribeSettings = subscribeSettings(request)
    darkScheme.addEventListener('change', request)
    window.addEventListener('resize', request)
    return () => {
      cancelAnimationFrame(frame)
      unsubscribeSettings()
      darkScheme.removeEventListener('change', request)
      window.removeEventListener('resize', request)
    }
  }, [draft, cellSize, mirror, stuck])

  const posAt = (e: PointerEvent): Pos => {
    const r = canvasRef.current!.getBoundingClientRect()
    const clamp = (n: number, max: number) => Math.min(Math.max(n, 0), max - 1)
    return {
      row: clamp(Math.floor((e.clientY - r.top) / cellSize), draft.height),
      col: clamp(Math.floor((e.clientX - r.left) / cellSize), draft.width),
    }
  }

  const apply = (to: Pos) => {
    const d = drag.current!
    const base = strokeStart()!
    const { tool, mirror } = props.current
    if (tool === 'pencil') strokeTo(line(getDraft(), d.last, to, d.color, mirror))
    else if (tool === 'line') strokeTo(line(base, d.start, to, d.color, mirror))
    else if (tool === 'rect') strokeTo(rect(base, d.start, to, d.color, mirror))
    d.last = to
  }

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current || (e.button !== 0 && e.button !== 2)) return
    const at = posAt(e)
    const { tool, color, mirror, onPick } = props.current
    if (e.altKey || tool === 'pick') {
      onPick(pick(getDraft(), at))
      return
    }
    const paintWith = e.button === 2 ? null : color
    if (e.button === 2) blockNextContextMenu()
    e.currentTarget.setPointerCapture(e.pointerId)
    beginStroke()
    if (tool === 'fill') {
      strokeTo(fill(getDraft(), at, paintWith, mirror))
      endStroke()
      return
    }
    drag.current = { id: e.pointerId, start: at, last: at, color: paintWith }
    apply(at)
  }

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const at = posAt(e)
    if (hover.current?.row !== at.row || hover.current?.col !== at.col) {
      hover.current = at
      redraw.current()
    }
    const d = drag.current
    if (d?.id === e.pointerId && (d.last.row !== at.row || d.last.col !== at.col)) apply(at)
  }

  const onPointerEnd = (e: PointerEvent<HTMLCanvasElement>) => {
    if (drag.current?.id !== e.pointerId) return
    drag.current = null
    endStroke()
  }

  return (
    <canvas
      ref={canvasRef}
      className={playStyles.canvas}
      style={{ width: draft.width * cellSize, height: draft.height * cellSize, cursor: 'crosshair' }}
      aria-label={`Drawing, ${draft.width} by ${draft.height}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onLostPointerCapture={onPointerEnd}
      onPointerLeave={() => {
        hover.current = null
        redraw.current()
      }}
      onContextMenu={e => e.preventDefault()}
    />
  )
}

/**
 * On Windows the context menu opens on mouseup under the cursor, which pointer capture doesn't retarget, so a
 * right drag released off the canvas would open it there (as in play/gestures.ts).
 */
function blockNextContextMenu() {
  const block = (e: Event) => {
    e.preventDefault()
    disarm()
  }
  const disarm = () => {
    window.removeEventListener('contextmenu', block, true)
    window.removeEventListener('pointerdown', disarm, true)
  }
  window.addEventListener('contextmenu', block, true)
  window.addEventListener('pointerdown', disarm, true)
}

function paint(canvas: HTMLCanvasElement, draft: Draft, cell: number, mirror: boolean, stuck: readonly number[], hover: Pos | null) {
  const { width, height, cells } = draft
  const dpr = window.devicePixelRatio || 1
  const w = width * cell
  const h = height * cell
  const pxWidth = Math.round(w * dpr)
  const pxHeight = Math.round(h * dpr)
  if (canvas.width !== pxWidth || canvas.height !== pxHeight) {
    canvas.width = pxWidth
    canvas.height = pxHeight
  }
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  const css = getComputedStyle(canvas)
  const color = (name: string) => css.getPropertyValue(name).trim()

  ctx.fillStyle = color('--board-bg')
  ctx.fillRect(0, 0, w, h)
  cells.forEach((c, i) => {
    if (c === null) return
    ctx.fillStyle = c
    ctx.fillRect((i % width) * cell, Math.floor(i / width) * cell, cell, cell)
  })

  const minor = color('--board-line')
  const major = color('--board-line-major')
  for (let c = 1; c < width; c++) {
    const thick = c % 5 === 0
    ctx.fillStyle = thick ? major : minor
    ctx.fillRect(c * cell - (thick ? 1 : 0.5), 0, thick ? 2 : 1, h)
  }
  for (let r = 1; r < height; r++) {
    const thick = r % 5 === 0
    ctx.fillStyle = thick ? major : minor
    ctx.fillRect(0, r * cell - (thick ? 1 : 0.5), w, thick ? 2 : 1)
  }
  ctx.strokeStyle = color('--board-border')
  ctx.lineWidth = 3
  ctx.strokeRect(1.5, 1.5, w - 3, h - 3)

  if (stuck.length > 0) {
    const pink = color('--pink')
    ctx.save()
    ctx.beginPath()
    for (const i of stuck) ctx.rect((i % width) * cell, Math.floor(i / width) * cell, cell, cell)
    ctx.clip()
    ctx.strokeStyle = pink
    ctx.lineWidth = 1.5
    ctx.beginPath()
    for (let d = -h; d < w; d += 6) {
      ctx.moveTo(d, h)
      ctx.lineTo(d + h, 0)
    }
    ctx.stroke()
    ctx.restore()
    ctx.lineWidth = 2
    ctx.setLineDash([3, 2])
    for (const i of stuck) ctx.strokeRect((i % width) * cell + 2, Math.floor(i / width) * cell + 2, cell - 4, cell - 4)
    ctx.setLineDash([])
  }

  if (mirror) {
    ctx.strokeStyle = color('--board-target')
    ctx.lineWidth = 2
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(w / 2, 0)
    ctx.lineTo(w / 2, h)
    ctx.stroke()
    ctx.setLineDash([])
  }

  if (hover) {
    ctx.strokeStyle = color('--board-cursor')
    ctx.lineWidth = 2
    ctx.strokeRect(hover.col * cell + 1, hover.row * cell + 1, cell - 2, cell - 2)
  }
}
