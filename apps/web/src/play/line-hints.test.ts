import { describe, expect, it } from 'vitest'
import type { Cell } from '@pixel-imperium/nonogram'
import { createLineHints } from './line-hints.ts'

// 3×2, row clues [1 1] and [3]; column clues [2] [1] [2].
const puzzle = { id: 't', width: 3, height: 2, clues: { rows: [[1, 1], [3]], cols: [[2], [1], [2]] } }

const parse = (rows: string[]): Cell[] =>
  rows.flatMap(r => Array.from(r, ch => (ch === '#' ? 'filled' : ch === 'x' ? 'marked' : 'empty')))

describe('createLineHints', () => {
  it('reports completed clues and impossible lines', () => {
    const hints = createLineHints(puzzle)(parse(['#x.', '#x.']))
    expect(hints.rows[0]).toEqual({ done: [true, false], impossible: false })
    expect(hints.rows[1]).toEqual({ done: [false], impossible: true })
    expect(hints.cols[0]).toEqual({ done: [true], impossible: false })
    expect(hints.cols[1]!.impossible).toBe(true)
  })

  it('keeps hint objects for unchanged lines', () => {
    const hintsFor = createLineHints(puzzle)
    const before = hintsFor(parse(['...', '...']))
    const same = hintsFor(parse(['...', '...']))
    expect(same.rows).toBe(before.rows)

    const after = hintsFor(parse(['#..', '...']))
    expect(after.rows).not.toBe(before.rows)
    expect(after.rows[1]).toBe(before.rows[1])
    expect(after.cols[1]).toBe(before.cols[1])
    expect(after.cols[0]).not.toBe(before.cols[0])
  })
})
