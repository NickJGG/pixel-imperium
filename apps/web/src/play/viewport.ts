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

/**
 * The live view of one board, kept out of React so pinches and pans never re-render. It mirrors
 * itself onto the attached board element as `--cell`, `--pan-x` and `--pan-y` for the clue panels.
 * A board that isn't `zoomable` stays at fit.
 */
export class BoardView {
  readonly grid: Grid
  readonly zoomable: boolean
  fitCell = 0
  private current: View = fitView(0)
  private element: HTMLElement | null = null
  private listeners = new Set<() => void>()

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

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  setFit(fitCell: number): void {
    if (fitCell === this.fitCell) return
    this.fitCell = fitCell
    this.update(fitView(fitCell))
  }

  set(view: View): void {
    if (!this.zoomable) return
    this.update(clampView(view, this.fitCell, this.grid))
  }

  zoomAt(cell: number, x: number, y: number): void {
    if (!this.zoomable) return
    this.update(zoomAt(this.current, cell, x, y, this.fitCell, this.grid))
  }

  attach(element: HTMLElement): () => void {
    this.element = element
    this.write()
    return () => {
      if (this.element === element) this.element = null
    }
  }

  private update(view: View): void {
    const { cell, panX, panY } = this.current
    if (view.cell === cell && view.panX === panX && view.panY === panY) return
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
