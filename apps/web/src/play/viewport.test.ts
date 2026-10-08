import { describe, expect, it } from 'vitest'
import { BoardView, MAX_ZOOM_CELL, cellAt, clampView, fitView, visibleRange, zoomAt } from './viewport.ts'

const grid = { width: 30, height: 20 }
const fit = 10

describe('clampView', () => {
  it('keeps the cell between fit and the zoom cap', () => {
    expect(clampView({ cell: 4, panX: 0, panY: 0 }, fit, grid).cell).toBe(fit)
    expect(clampView({ cell: 99, panX: 0, panY: 0 }, fit, grid).cell).toBe(MAX_ZOOM_CELL)
  })

  it('has no zoom range when fit is already past the cap', () => {
    expect(clampView({ cell: 80, panX: -50, panY: -50 }, 60, grid)).toEqual(fitView(60))
  })

  it('keeps the board covering the fit box', () => {
    expect(clampView({ cell: 20, panX: 5, panY: 5 }, fit, grid)).toEqual({ cell: 20, panX: 0, panY: 0 })
    expect(clampView({ cell: 20, panX: -9999, panY: -9999 }, fit, grid)).toEqual({ cell: 20, panX: -300, panY: -200 })
  })
})

describe('zoomAt', () => {
  it('keeps the point under the cursor in place', () => {
    const view = zoomAt(fitView(fit), 20, 150, 100, fit, grid)
    expect(view).toEqual({ cell: 20, panX: -150, panY: -100 })
    expect(cellAt(view, 150, 100)).toEqual(cellAt(fitView(fit), 150, 100))
  })

  it('stops at the cap without drifting', () => {
    const at = zoomAt({ cell: 40, panX: -100, panY: -100 }, 999, 50, 50, fit, grid)
    expect(at.cell).toBe(MAX_ZOOM_CELL)
    expect(at.panX).toBeCloseTo(50 - 150 * (MAX_ZOOM_CELL / 40))
  })

  it('zooming out to fit recentres the board', () => {
    expect(zoomAt({ cell: 30, panX: -200, panY: -100 }, 1, 10, 10, fit, grid)).toEqual(fitView(fit))
  })
})

describe('visibleRange', () => {
  it('is the whole grid at fit', () => {
    expect(visibleRange(fitView(fit), fit, grid)).toEqual({ row0: 0, row1: 19, col0: 0, col1: 29 })
  })

  it('covers partly visible cells when zoomed', () => {
    expect(visibleRange({ cell: 40, panX: -45, panY: -80 }, fit, grid)).toEqual({ row0: 2, row1: 6, col0: 1, col1: 8 })
  })
})

describe('BoardView', () => {
  it('starts at fit and clamps what it is given', () => {
    const view = new BoardView(grid, true)
    view.setFit(fit)
    expect(view.view).toEqual(fitView(fit))
    view.set({ cell: 20, panX: 10, panY: -500 })
    expect(view.view).toEqual({ cell: 20, panX: 0, panY: -200 })
    expect(view.zoomed).toBe(true)
  })

  it('stays at fit when not zoomable', () => {
    const view = new BoardView(grid, false)
    view.setFit(fit)
    view.zoomAt(30, 0, 0)
    expect(view.view).toEqual(fitView(fit))
  })

  it('notifies only on a change', () => {
    const view = new BoardView(grid, true)
    view.setFit(fit)
    let calls = 0
    view.subscribe(() => calls++)
    view.set(fitView(fit))
    view.zoomAt(20, 0, 0)
    expect(calls).toBe(1)
  })
})
