import { describe, expect, it } from 'vitest'
import type { Cell } from '@pixel-imperium/nonogram'
import { type Lesson, LESSONS, lessonPuzzle } from './lessons.ts'
import { cellsBefore, cite, citedFlag, currentStep, judge, lessonFeedback, stepCells } from './steps.ts'

const gate = LESSONS[0]!
const puzzle = lessonPuzzle(gate)
const { width, height } = puzzle
const blank = (): Cell[] => Array<Cell>(width * height).fill('empty')

describe('currentStep', () => {
  it('starts on the first step', () => {
    expect(currentStep(gate, blank(), width)).toBe(0)
  })

  it('advances past every met step, and back again on undo', () => {
    expect(currentStep(gate, cellsBefore(gate, 2, width, height), width)).toBe(2)
    const cells = cellsBefore(gate, 2, width, height)
    cells[0] = 'empty'
    expect(currentStep(gate, cells, width)).toBe(0)
  })

  it('stays on a later step met before an earlier one', () => {
    const cells = blank()
    for (let c = 0; c < width; c++) cells[4 * width + c] = 'marked'
    expect(currentStep(gate, cells, width)).toBe(0)
  })

  it('never passes a step that asks for the solved picture', () => {
    const circlet = LESSONS[1]!
    const { width, palette } = lessonPuzzle(circlet)
    const solved = palette.map((c): Cell => (c === null ? 'marked' : 'filled'))
    expect(currentStep(circlet, solved, width)).toBe(circlet.steps.length - 1)
  })

  it('runs to the end once every gated step is met', () => {
    expect(currentStep(gate, cellsBefore(gate, 3, width, height), width)).toBe(3)
  })
})

describe('cellsBefore', () => {
  it('places the givens before any step', () => {
    const staged: Lesson = { ...gate, given: { filled: [[2, 2]], marked: [[4, 0]] } }
    const cells = cellsBefore(staged, 1, width, height)
    expect(cells[2 * width + 2]).toBe('filled')
    expect(cells[4 * width]).toBe('marked')
    expect(cells.slice(0, width)).toEqual(Array(width).fill('filled'))
    expect(cells.filter(c => c !== 'empty')).toHaveLength(width + 2)
  })
})

describe('stepCells', () => {
  it('lists the step targets as indices, filled then marked', () => {
    expect(stepCells(gate.steps[0]!, width)).toEqual([0, 1, 2, 3, 4])
    expect(stepCells(LESSONS[1]!.steps[2]!, width)).toEqual([15, 16, 18, 19, 17])
    expect(stepCells(LESSONS[1]!.steps[4]!, width)).toEqual([])
  })
})

describe('judge', () => {
  const banner = LESSONS[2]!
  const puzzle = lessonPuzzle(banner)
  const at = (r: number, c: number) => r * puzzle.width + c
  const fill = (...refs: [number, number][]) => {
    const cells = blank()
    for (const [r, c] of refs) cells[at(r, c)] = 'filled'
    return cells
  }
  const verdict = (cells: Cell[], r: number, c: number, step = 0) => judge(puzzle, banner, cells, at(r, c), step)

  it('calls a cell no line proves yet a guess, right or wrong', () => {
    expect(verdict(fill([4, 1]), 4, 1)).toEqual({ kind: 'guess' })
    expect(verdict(fill([4, 3]), 4, 3)).toEqual({ kind: 'guess' })
  })

  it('names the line that rules a cell out', () => {
    expect(verdict(fill([0, 4]), 0, 4)).toEqual({ kind: 'ruled', line: { axis: 'col', index: 4 } })
  })

  it('sets aside a cell proven outside the step', () => {
    expect(verdict(fill([0, 0]), 0, 0)).toEqual({ kind: 'aside', line: { axis: 'col', index: 0 } })
  })

  it('judges the move that finishes a step by that step', () => {
    const before = fill([0, 1], [0, 2])
    const cells = fill([0, 1], [0, 2], [0, 3])
    expect(verdict(cells, 0, 3, 0)).toEqual({ kind: 'ok' })
    expect(verdict(cells, 0, 3, 1)).toEqual({ kind: 'aside', line: { axis: 'row', index: 0 } })
    expect(cite(puzzle, banner, cells, before, null)).toBeNull()
  })

  it('knows only the cells that agree with the picture', () => {
    const cells = fill([4, 4])
    cells[at(4, 0)] = 'marked'
    expect(verdict(cells, 4, 0)).toEqual({ kind: 'ruled', line: { axis: 'col', index: 0 } })
  })

  it('cites the newest flagged move, with the step it was made in', () => {
    const before = fill([4, 1])
    const cells = fill([4, 1], [0, 4])
    expect(cite(puzzle, banner, cells, before, { cell: at(4, 1), step: 0 })).toEqual({ cell: at(0, 4), step: 0 })
  })

  it('keeps citing a guess until it is proven', () => {
    const cells = fill([4, 1])
    const cited = { cell: at(4, 1), step: 0 }
    const later = fill([4, 1], [0, 1])
    expect(cite(puzzle, banner, later, cells, cited)).toEqual(cited)
    expect(citedFlag(puzzle, banner, later, cited)).toEqual({ kind: 'guess' })
  })

  it('drops an aside on the next move, falling back to a cell still ruled out', () => {
    const before = fill([0, 4], [0, 0])
    const cells = fill([0, 4], [0, 0], [0, 1])
    expect(cite(puzzle, banner, cells, before, { cell: at(0, 0), step: 0 })).toEqual({ cell: at(0, 4), step: 0 })
  })

  it('hides an aside once its step has passed', () => {
    const cells = fill([0, 0], [0, 1], [0, 2], [0, 3])
    expect(citedFlag(puzzle, banner, cells, { cell: at(0, 0), step: 0 })).toBeNull()
  })

  it('words each flag', () => {
    const step = banner.steps[0]!
    expect(lessonFeedback(puzzle, step, 'filled', { kind: 'aside', line: { axis: 'col', index: 0 } })).toBe(
      'True: column 1 says **5**, so this cell is filled. Keep it. But this step is about row 1, so come back to that.',
    )
    expect(lessonFeedback(puzzle, step, 'filled', { kind: 'guess' })).toBe(
      'Nothing on the board proves this cell yet. Clear it and follow the lesson.',
    )
    expect(lessonFeedback(puzzle, step, 'filled', { kind: 'ruled', line: { axis: 'col', index: 4 } })).toBe(
      "Column 5 says **0**: with what's on the board, this cell can't be filled. Clear it.",
    )
    expect(lessonFeedback(puzzle, step, 'marked', { kind: 'ruled', line: { axis: 'row', index: 0 } })).toBe(
      "Row 1 says **4**: with what's on the board, this cell must be filled. Clear the cross.",
    )
  })
})
