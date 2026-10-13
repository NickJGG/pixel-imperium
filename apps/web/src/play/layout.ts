import { useSyncExternalStore } from 'react'
import type { Clues } from '@pixel-imperium/nonogram'

/** Depth of one clue number, in fit cells, before `clueSlot` clamps it to pixels. */
const CLUE_SLOT = 0.8
const CLUE_PADDING = 0.4
const MIN_SLOT = 14
const MAX_SLOT = 32
const MIN_CELL = 6
const MAX_CELL = 40

/** Play's right rail: the HUD pills, the title, progress and the tools. */
export const RAIL_WIDTH = 300

/** The lesson page's gap between its board card and its side column. */
export const SIDE_PAGE_GAP = 16

/** Windows that get the rail; every other shape gets the bottom dock. */
export const RAIL_QUERY = '(orientation: landscape) and (min-height: 600px)'
const RAIL_MIN_HEIGHT = 600

interface FitPuzzle {
  width: number
  height: number
  clues: Clues
}

const clamp = (n: number, min: number, max: number) => Math.min(Math.max(n, min), max)

const longest = (lines: number[][]) => Math.max(1, ...lines.map(l => l.length))

/** Depth of one clue number in pixels, fixed per board so zooming never moves the layout. */
export const clueSlot = (fitCell: number) => clamp(fitCell * CLUE_SLOT, MIN_SLOT, MAX_SLOT)

/** A clue panel's depth in pixels; the clue panels' CSS fits inside it. */
export const clueDepth = (lines: number[][], slot: number) => (longest(lines) + CLUE_PADDING / CLUE_SLOT) * slot

/**
 * The largest whole-pixel cell size that fits the grid plus its clue panels in `available`.
 * The slot comes from a fit with cell-relative clues; where `clueSlot` clamps it up, the clues
 * get deeper and the grid refits around them. Unclamped, the result is the cell-relative fit.
 */
export function fitCellSize(available: { width: number; height: number }, puzzle: FitPuzzle): number {
  const { width, height, clues } = puzzle
  const relative = (lines: number[][]) => longest(lines) * CLUE_SLOT + CLUE_PADDING
  const first = clamp(
    Math.floor(Math.min(available.width / (width + relative(clues.rows)), available.height / (height + relative(clues.cols)))),
    MIN_CELL,
    MAX_CELL,
  )
  const slot = clueSlot(first)
  const size = Math.min(
    (available.width - clueDepth(clues.rows, slot)) / width,
    (available.height - clueDepth(clues.cols, slot)) / height,
  )
  // Never above the first fit: a bigger cell could pick a bigger slot than the one fitted here.
  // The epsilon keeps an exact fit from flooring a cell short on float error.
  return clamp(Math.min(Math.floor(size + 1e-9), first), MIN_CELL, MAX_CELL)
}

/** The board's fixed grid tracks: clue panel depths and the fit box the canvas fills. */
export function boardTracks(puzzle: FitPuzzle, fitCell: number): Record<string, string> {
  const slot = clueSlot(fitCell)
  return {
    '--clue-slot': `${slot}px`,
    '--row-depth': `${clueDepth(puzzle.clues.rows, slot)}px`,
    '--col-depth': `${clueDepth(puzzle.clues.cols, slot)}px`,
    '--fit-width': `${puzzle.width * fitCell}px`,
    '--fit-height': `${puzzle.height * fitCell}px`,
  }
}

/** `RAIL_QUERY` for a window size, as matchMedia reads it: a square window counts as landscape. */
export const railFor = ({ width, height }: { width: number; height: number }) =>
  width >= height && height >= RAIL_MIN_HEIGHT

const subscribeRail = (onChange: () => void) => {
  const query = matchMedia(RAIL_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Whether the window's shape gets the rail. */
export const useRail = () => useSyncExternalStore(subscribeRail, () => matchMedia(RAIL_QUERY).matches)

/** Windows where a Lesson drops its coach under the board instead of standing Play's strip and rail. */
export const LESSON_STACKED = '(max-width: 860px)'

const subscribeStacked = (onChange: () => void) => {
  const query = matchMedia(LESSON_STACKED)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export const useLessonStacked = () => useSyncExternalStore(subscribeStacked, () => matchMedia(LESSON_STACKED).matches)
