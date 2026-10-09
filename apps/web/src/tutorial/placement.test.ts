import { describe, expect, it } from 'vitest'
import { type PlaceInput, placeCallout } from './placement.ts'

const board = { width: 5, height: 5, cell: 50, rowDepth: 60, colDepth: 70 }
// The board is 310 wide and 320 tall, centred in a stage 1000 wide.
const wide: Omit<PlaceInput, 'lines'> = { board, whole: false, stacked: false, stage: { width: 1000 }, boardLeft: 345 }

describe('placeCallout', () => {
  it('puts a top-half row beat under its row', () => {
    expect(placeCallout({ ...wide, lines: { rows: [1] } })).toEqual({ side: 'below', left: 0, width: 300, top: 70 + 2 * 50 + 14 })
  })

  it('puts a bottom-half row beat over its highest row', () => {
    expect(placeCallout({ ...wide, lines: { rows: [2, 4] } })).toEqual({ side: 'above', left: 0, width: 300, bottom: 320 - (70 + 2 * 50) + 14 })
  })

  it('puts a column beat right of the board when there is room', () => {
    expect(placeCallout({ ...wide, lines: { cols: [4] } })).toEqual({ side: 'right', left: 310 + 14, width: 240, top: 70 })
  })

  it('puts a column beat left of the board when only the left has room', () => {
    expect(placeCallout({ ...wide, stage: { width: 700 }, boardLeft: 380, lines: { cols: [0] } })).toEqual({
      side: 'left',
      left: -14 - 240,
      width: 240,
      top: 70,
    })
  })

  it('docks a column beat on a narrow stage', () => {
    expect(placeCallout({ ...wide, stage: { width: 600 }, boardLeft: 145, lines: { cols: [0] } })).toBe('dock')
  })

  it('docks a whole-board beat, and a beat with no line', () => {
    expect(placeCallout({ ...wide, whole: true, lines: { rows: [0] } })).toBe('dock')
    expect(placeCallout({ ...wide, lines: {} })).toBe('dock')
  })

  it('docks everything in the stacked layout', () => {
    expect(placeCallout({ ...wide, stacked: true, lines: { rows: [0] } })).toBe('dock')
  })

  it('keeps a row callout no wider than the board', () => {
    const small = { ...board, cell: 30, rowDepth: 40 }
    expect(placeCallout({ ...wide, board: small, lines: { rows: [0] } })).toMatchObject({ width: 190 })
  })
})
