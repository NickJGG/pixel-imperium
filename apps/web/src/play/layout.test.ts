import { describe, expect, it } from 'vitest'
import { PILL_BAND, SIDE_PAGE_GAP, SIDE_PAGE_WIDTH, fitCellSize, fitPlay } from './layout.ts'

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
    expect(fit.cellSize).toBe(fitCellSize({ width: 700, height: 700 - PILL_BAND }, square(10)))
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

  it('keeps the board above the pill band', () => {
    for (const n of [5, 10, 15, 20, 30]) {
      for (const height of [400, 520, 640, 777, 900]) {
        const { cellSize } = fitPlay({ width: 2000, height }, square(n))
        expect(cellSize * (n + 1.2)).toBeLessThanOrEqual(height - PILL_BAND)
      }
    }
  })

  it('sizes to the height left over once the band is taken', () => {
    const height = 40 * (10 + 1.2) + PILL_BAND
    expect(fitPlay({ width: 2000, height }, square(10)).cellSize).toBe(40)
    expect(fitPlay({ width: 2000, height: height - 1 }, square(10)).cellSize).toBe(39)
  })
})
