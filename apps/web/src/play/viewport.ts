/**
 * The zoomed board seen through the fit box: the canvas and clue panels stay at fit size, and a
 * `View` says how big a cell is and where the grid's top-left sits, in CSS pixels from the box's.
 * The view always covers the box: zoom never goes below fit, and pan never shows past an edge.
 */
import type { Pos } from './store.ts'

export interface View {
  cell: number
  panX: number
  panY: number
}

export interface Grid {
  width: number
  height: number
}

export const MAX_ZOOM_CELL = 48

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

export const fitView = (fitCell: number): View => ({ cell: fitCell, panX: 0, panY: 0 })

export function clampView(view: View, fitCell: number, grid: Grid): View {
  const cell = clamp(view.cell, fitCell, Math.max(MAX_ZOOM_CELL, fitCell))
  const axis = (pan: number, cells: number) => clamp(pan, cells * (fitCell - cell), 0)
  return { cell, panX: axis(view.panX, grid.width), panY: axis(view.panY, grid.height) }
}

/** Zooms to `cell`, keeping the board point under (`x`, `y`) in place. */
export function zoomAt(view: View, cell: number, x: number, y: number, fitCell: number, grid: Grid): View {
  const f = clampView({ ...view, cell }, fitCell, grid).cell / view.cell
  return clampView({ cell: view.cell * f, panX: x - (x - view.panX) * f, panY: y - (y - view.panY) * f }, fitCell, grid)
}

/** Puts the grid point at fractional cell (`row`, `col`) at the centre of the fit box, as far as the edges allow. */
export function centerOn(view: View, row: number, col: number, fitCell: number, grid: Grid): View {
  const { cell } = view
  return clampView(
    { cell, panX: (grid.width * fitCell) / 2 - col * cell, panY: (grid.height * fitCell) / 2 - row * cell },
    fitCell,
    grid,
  )
}

/** The least pan that shows `pos` with `margin` cells around it. */
export function ensureVisible(view: View, { row, col }: Pos, margin: number, fitCell: number, grid: Grid): View {
  const { cell } = view
  const axis = (pan: number, i: number, cells: number) =>
    Math.max(Math.min(pan, cells * fitCell - (i + 1 + margin) * cell), -(i - margin) * cell)
  return clampView(
    { cell, panX: axis(view.panX, col, grid.width), panY: axis(view.panY, row, grid.height) },
    fitCell,
    grid,
  )
}

/** The same view on a box refitted from `fromFit` to `toFit`: the zoom over fit and the centre cell stay. */
export function refitView(view: View, fromFit: number, toFit: number, grid: Grid): View {
  const k = toFit / fromFit
  const scaled = { cell: view.cell * k, panX: view.panX * k, panY: view.panY * k }
  return zoomAt(scaled, scaled.cell, (grid.width * toFit) / 2, (grid.height * toFit) / 2, toFit, grid)
}

const sameView = (a: View, b: View) => a.cell === b.cell && a.panX === b.panX && a.panY === b.panY

/** The cell under (`x`, `y`), which may lie outside the grid. */
export const cellAt = ({ cell, panX, panY }: View, x: number, y: number): Pos => ({
  row: Math.floor((y - panY) / cell),
  col: Math.floor((x - panX) / cell),
})

/** The rows and columns at least partly inside the fit box, inclusive. */
export function visibleRange({ cell, panX, panY }: View, fitCell: number, grid: Grid) {
  const last = (pan: number, cells: number) => Math.min(cells - 1, Math.floor((cells * fitCell - pan - 0.01) / cell))
  return {
    row0: Math.max(0, Math.floor(-panY / cell)),
    row1: last(panY, grid.height),
    col0: Math.max(0, Math.floor(-panX / cell)),
    col1: last(panX, grid.width),
  }
}

const easeOut = (t: number) => 1 - (1 - t) ** 3

/**
 * The live view of one board, kept out of React so pinches and pans never re-render. It mirrors
 * itself onto the attached board element as `--cell`, `--pan-x` and `--pan-y` for the clue panels.
 * A board that isn't `zoomable` stays at fit; a `locked` one only moves by `animateTo`.
 */
export class BoardView {
  readonly grid: Grid
  readonly zoomable: boolean
  fitCell = 0
  locked = false
  private current: View = fitView(0)
  private element: HTMLElement | null = null
  private listeners = new Set<() => void>()
  private animation: { target: View; frame: number; done: () => void } | null = null

  constructor(grid: Grid, zoomable: boolean) {
    this.grid = grid
    this.zoomable = zoomable
  }

  get view(): View {
    return this.current
  }

  get zoomed(): boolean {
    return this.current.cell > this.fitCell + 0.5
  }

  /** Whether the player can zoom and pan right now; false also when fit leaves no range to zoom. */
  get canZoom(): boolean {
    return this.zoomable && !this.locked && this.fitCell < MAX_ZOOM_CELL
  }

  get animating(): boolean {
    return this.animation !== null
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setFit(fitCell: number): void {
    if (fitCell === this.fitCell) return
    const from = this.animation?.target ?? this.current
    this.stop()
    const view = this.fitCell > 0 && this.zoomable ? refitView(from, this.fitCell, fitCell, this.grid) : fitView(fitCell)
    this.fitCell = fitCell
    this.update(view)
  }

  set(view: View): void {
    if (!this.canZoom) return
    this.stop()
    this.update(clampView(view, this.fitCell, this.grid))
  }

  zoomAt(cell: number, x: number, y: number): void {
    if (!this.canZoom) return
    this.stop()
    this.update(zoomAt(this.current, cell, x, y, this.fitCell, this.grid))
  }

  /** Centres the grid point at fractional cell (`row`, `col`). */
  centerOn(row: number, col: number): void {
    this.set(centerOn(this.current, row, col, this.fitCell, this.grid))
  }

  /** Nudges the pan so `pos` and a cell around it are on show. */
  follow(pos: Pos): void {
    this.set(ensureVisible(this.current, pos, 1, this.fitCell, this.grid))
  }

  /** Glides to centre `pos` at the current zoom, unless it's already wholly on show. */
  reveal(pos: Pos): void {
    if (!this.canZoom || sameView(ensureVisible(this.current, pos, 0, this.fitCell, this.grid), this.current)) return
    void this.animateTo(centerOn(this.current, pos.row + 0.5, pos.col + 0.5, this.fitCell, this.grid), 220)
  }

  /**
   * Glides to `target`, even while locked. Settles when it arrives, or early when cut off by
   * another move or a refit.
   */
  animateTo(target: View, ms: number): Promise<void> {
    this.stop()
    if (!this.zoomable) return Promise.resolve()
    const to = clampView(target, this.fitCell, this.grid)
    const from = this.current
    if (ms <= 0 || sameView(from, to) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.update(to)
      return Promise.resolve()
    }
    return new Promise(resolve => {
      const start = performance.now()
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms)
        if (t === 1) {
          this.animation = null
          this.update(to)
          return resolve()
        }
        const e = easeOut(t)
        const mix = (a: number, b: number) => a + (b - a) * e
        this.animation!.frame = requestAnimationFrame(step)
        this.update({ cell: mix(from.cell, to.cell), panX: mix(from.panX, to.panX), panY: mix(from.panY, to.panY) })
      }
      this.animation = { target: to, frame: requestAnimationFrame(step), done: resolve }
    })
  }

  private stop(): void {
    const animation = this.animation
    if (!animation) return
    this.animation = null
    cancelAnimationFrame(animation.frame)
    animation.done()
  }

  attach(element: HTMLElement): () => void {
    this.element = element
    this.write()
    return () => {
      if (this.element === element) this.element = null
    }
  }

  private update(view: View): void {
    if (sameView(view, this.current)) return
    this.current = view
    this.write()
    for (const listener of this.listeners) listener()
  }

  private write(): void {
    const el = this.element
    if (!el) return
    el.style.setProperty('--cell', `${this.current.cell}px`)
    el.style.setProperty('--pan-x', `${this.current.panX}px`)
    el.style.setProperty('--pan-y', `${this.current.panY}px`)
    el.toggleAttribute('data-zoomed', this.zoomed)
  }
}
