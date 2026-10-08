import { describe, expect, it } from 'vitest'
import type { Cell } from '@pixel-imperium/nonogram'
import { type Lesson, LESSONS, lessonPuzzle } from './lessons.ts'
import { cellsBefore, currentStep, feedback, stepCells, wrongCell } from './steps.ts'

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

describe('wrongCell', () => {
  it('cites the cell the last edit made wrong', () => {
    const before = blank()
    before[22] = 'filled'
    const cells = before.slice()
    cells[23] = 'filled'
    expect(wrongCell(puzzle, cells, before, 22)).toBe(23)
  })

  it('keeps citing a cell that is still wrong', () => {
    const cells = blank()
    cells[22] = 'filled'
    cells[23] = 'filled'
    expect(wrongCell(puzzle, cells, cells, 23)).toBe(23)
  })

  it('moves on to another wrong cell once the cited one is fixed', () => {
    const cells = blank()
    cells[22] = 'filled'
    expect(wrongCell(puzzle, cells, cells, 23)).toBe(22)
  })

  it('is null when nothing is wrong', () => {
    const cells = blank()
    cells[0] = 'filled'
    cells[24] = 'marked'
    expect(wrongCell(puzzle, cells, blank(), null)).toBeNull()
  })
})

describe('feedback', () => {
  it('cites both clues for a fill that should be empty', () => {
    const cells = blank()
    cells[22] = 'filled'
    expect(feedback(puzzle, cells, 22)).toBe(
      'That cell stays empty. Row 5 says **0** and column 3 says **1**, and neither has room for it. Click it again to clear it.',
    )
  })

  it('explains a cross on a picture cell', () => {
    const cells = blank()
    cells[0] = 'marked'
    expect(feedback(puzzle, cells, 0)).toMatch(/^That cell is part of the picture/)
  })
})
