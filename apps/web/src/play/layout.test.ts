import { describe, expect, it } from 'vitest'
import { SIDE_PAGE_GAP, SIDE_PAGE_WIDTH, fitCellSize, fitPlay } from './layout.ts'

const square = (n: number) => ({
  width: n,
  height: n,
  clues: { rows: Array.from({ length: n }, () => [1]), cols: Array.from({ length: n }, () => [1]) },
})

describe('fitPlay', () => {
  it('shows the side page when the board keeps its size beside it', () => {
    const fit = fitPlay({ width: 1200, height: 500 }, square(5))
    expect(fit).toEqual({ cellSize: 40, sidePage: true })
  })

  it('never shrinks the board to make room for the side page', () => {
    const available = { width: 700, height: 700 }
    const fit = fitPlay(available, square(10))
    expect(fit.cellSize).toBe(fitCellSize(available, square(10)))
    expect(fit.sidePage).toBe(false)
  })

  it('hides the side page when the board overflows at its smallest size', () => {
    expect(fitPlay({ width: 300, height: 300 }, square(30)).sidePage).toBe(false)
  })

  it('needs room for the side page plus its gap', () => {
    const board = 40 * (5 + 1.2)
    expect(fitPlay({ width: board + SIDE_PAGE_WIDTH + SIDE_PAGE_GAP, height: 1000 }, square(5)).sidePage).toBe(true)
    expect(fitPlay({ width: board + SIDE_PAGE_WIDTH + SIDE_PAGE_GAP - 1, height: 1000 }, square(5)).sidePage).toBe(false)
  })
})
