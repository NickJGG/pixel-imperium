import { useEffect, useRef } from 'react'
import { clueDepth, clueSlot } from './layout.ts'
import type { PlayStore } from './store.ts'
import type { BoardView } from './viewport.ts'
import styles from './Play.module.css'

const PADDING = 4

/**
 * The whole board in the clue corner while zoomed: filled cells, the hint, and the part on show.
 * It needs a whole pixel per cell, so a corner too small for that stays empty. Its presses are
 * handled by the gesture controller.
 */
export function Minimap({ store, view, cellSize }: { store: PlayStore; view: BoardView; cellSize: number }) {
  const { width, height, clues } = store.puzzle
  const slot = clueSlot(cellSize)
  const scale = Math.floor(
    Math.min((clueDepth(clues.rows, slot) - PADDING) / width, (clueDepth(clues.cols, slot) - PADDING) / height),
  )
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    const draw = () => {
      frame = 0
      paintMap(canvas, store, view, scale)
    }
    const request = () => {
      frame ||= requestAnimationFrame(draw)
    }
    request()
    const unsubscribe = store.subscribe(request)
    const unsubscribeView = view.subscribe(request)
    window.addEventListener('resize', request)
    return () => {
      unsubscribe()
      unsubscribeView()
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', request)
    }
  }, [store, view, scale])

  return (
    <div className={styles.corner}>
      {scale >= 1 && (
        <canvas
          ref={canvasRef}
          className={styles.minimap}
          style={{ width: width * scale, height: height * scale }}
          data-zone="map"
          aria-hidden="true"
        />
      )}
    </div>
  )
}

function paintMap(canvas: HTMLCanvasElement, store: PlayStore, view: BoardView, scale: number) {
  const { width, height } = store.puzzle
  const dpr = window.devicePixelRatio || 1
  const boxWidth = width * scale
  const boxHeight = height * scale
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

  ctx.fillStyle = color('--board-bg')
  ctx.fillRect(0, 0, boxWidth, boxHeight)
  const { cells, hint } = store.getState()
  ctx.fillStyle = color('--board-fill')
  cells.forEach((c, i) => {
    if (c === 'filled') ctx.fillRect((i % width) * scale, Math.floor(i / width) * scale, scale, scale)
  })
  if (hint) {
    ctx.fillStyle = color(hint.kind === 'mistake' ? '--board-mistake' : '--board-reveal')
    const pad = scale < 3 ? 1 : 0
    ctx.fillRect((hint.index % width) * scale - pad, Math.floor(hint.index / width) * scale - pad, scale + pad * 2, scale + pad * 2)
  }

  const { cell, panX, panY } = view.view
  const k = scale / cell
  ctx.strokeStyle = color('--pink')
  ctx.lineWidth = 1.5
  ctx.strokeRect(-panX * k + 0.75, -panY * k + 0.75, width * view.fitCell * k - 1.5, height * view.fitCell * k - 1.5)
}
