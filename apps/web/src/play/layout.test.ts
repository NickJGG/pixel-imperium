import { describe, expect, it } from 'vitest'
import { clueDepth, clueSlot, fitCellSize, railFor } from './layout.ts'

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

describe('railFor', () => {
  it('gives landscape windows at least 600 tall the rail', () => {
    for (const size of [
      { width: 1218, height: 990 },
      { width: 1366, height: 768 },
      { width: 1920, height: 1080 },
      { width: 800, height: 600 },
      { width: 700, height: 700 },
    ]) {
      expect(railFor(size)).toBe(true)
    }
  })

  it('gives portrait windows and short landscape ones the dock', () => {
    for (const size of [
      { width: 390, height: 844 },
      { width: 820, height: 1180 },
      { width: 844, height: 390 },
      { width: 1200, height: 599 },
      { width: 699, height: 700 },
    ]) {
      expect(railFor(size)).toBe(false)
    }
  })
})
