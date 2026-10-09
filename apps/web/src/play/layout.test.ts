import { describe, expect, it } from 'vitest'
import { PILL_BAND, SIDE_PAGE_GAP, SIDE_PAGE_WIDTH, clueDepth, clueSlot, fitCellSize, fitPlay } from './layout.ts'

const square = (n: number, clue: number[] = [1]) => ({
  width: n,
  height: n,
  clues: { rows: Array.from({ length: n }, () => clue), cols: Array.from({ length: n }, () => clue) },
})

const boardSize = (cell: number, puzzle: ReturnType<typeof square>) => {
  const slot = clueSlot(cell)
  return {
    width: cell * puzzle.width + clueDepth(puzzle.clues.rows, slot),
    height: cell * puzzle.height + clueDepth(puzzle.clues.cols, slot),
  }
}

describe('fitCellSize', () => {
  it('keeps the cell-relative fit while the clue slot is unclamped', () => {
    for (const n of [5, 10, 15]) {
      for (const clue of [[1], [1, 1, 1], [2, 1, 2, 1]]) {
        for (const side of [400, 520, 777, 1000]) {
          const puzzle = square(n, clue)
          const relative = Math.min(40, Math.floor(side / (n + clue.length * 0.8 + 0.4)))
          if (relative * 0.8 < 14) continue
          expect(fitCellSize({ width: side, height: side }, puzzle)).toBe(relative)
        }
      }
    }
  })

  it('keeps big boards readable with deeper clues, still inside the box', () => {
    const puzzle = square(30, [1, 2, 1, 2, 1, 2, 1])
    const available = { width: 390, height: 600 }
    const cell = fitCellSize(available, puzzle)
    expect(clueSlot(cell)).toBe(14)
    const size = boardSize(cell, puzzle)
    expect(size.width).toBeLessThanOrEqual(available.width)
    expect(boardSize(cell + 1, puzzle).width).toBeGreaterThan(available.width)
  })
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

  it('keeps the board above the pill band without the side page', () => {
    for (const n of [5, 10, 15, 20, 30]) {
      for (const height of [400, 520, 640, 777, 900]) {
        const fit = fitPlay({ width: 460, height }, square(n))
        expect(fit.sidePage).toBe(false)
        expect(boardSize(fit.cellSize, square(n)).height).toBeLessThanOrEqual(height - PILL_BAND)
      }
    }
  })

  it('takes the band from the height only without the side page', () => {
    const height = 40 * (10 + 1.2)
    expect(fitPlay({ width: 2000, height }, square(10))).toEqual({ cellSize: 40, sidePage: true })
    expect(fitPlay({ width: 2000, height: height - 1 }, square(10)).cellSize).toBe(39)
    expect(fitPlay({ width: 460, height: height + PILL_BAND }, square(10))).toEqual({ cellSize: 40, sidePage: false })
    expect(fitPlay({ width: 460, height: height + PILL_BAND - 1 }, square(10)).cellSize).toBe(39)
  })

  it('decides the side page at the full height, before the band shrinks the board', () => {
    const puzzle = square(10)
    const height = 40 * 11.2
    const width = boardSize(40, puzzle).width + SIDE_PAGE_WIDTH + SIDE_PAGE_GAP - 1
    expect(fitPlay({ width, height }, puzzle)).toEqual({
      cellSize: fitCellSize({ width, height: height - PILL_BAND }, puzzle),
      sidePage: false,
    })
  })
})
