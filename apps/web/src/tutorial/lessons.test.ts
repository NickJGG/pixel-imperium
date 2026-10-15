import { describe, expect, it } from 'vitest'
import { type SolverCell, isLogicSolvable, isUnique, linePlacements, lineSolve } from '@pixel-imperium/nonogram'
import { type Draw, type Lesson, type LineRef, LESSONS, lessonPuzzle } from './lessons.ts'
import { cellsBefore, currentStep } from './steps.ts'
import { TECHNIQUES } from './techniques.ts'
import { TRACKS } from './tracks.ts'

/** What line logic on just the step's highlighted lines yields from the givens and the cells earlier steps settled. */
function deducible(lesson: Lesson, stepIndex: number): SolverCell[] {
  const { width, height, clues } = lessonPuzzle(lesson)
  const g = Array<SolverCell>(width * height).fill('unknown')
  for (const placed of [lesson.given ?? {}, ...lesson.steps.slice(0, stepIndex).map(s => s.target)]) {
    if (placed === 'solved') continue
    for (const [r, c] of placed.filled ?? []) g[r * width + c] = 'filled'
    for (const [r, c] of placed.marked ?? []) g[r * width + c] = 'empty'
  }
  const { rows = [], cols = [] } = lesson.steps[stepIndex]!.highlight
  const lines = [
    ...rows.map(r => ({ clue: clues.rows[r]!, at: Array.from({ length: width }, (_, c) => r * width + c) })),
    ...cols.map(c => ({ clue: clues.cols[c]!, at: Array.from({ length: height }, (_, r) => r * width + c) })),
  ]
  let changed = true
  while (changed) {
    changed = false
    for (const { clue, at } of lines) {
      const solved = lineSolve(at.map(i => g[i]!), clue)
      if (!solved) throw new Error('contradiction')
      at.forEach((i, k) => {
        if (g[i] === 'unknown' && solved[k] !== 'unknown') {
          g[i] = solved[k]!
          changed = true
        }
      })
    }
  }
  return g
}

/** The cells a draw covers along its line. A `bad` ghost may run off the grid, so only its start counts. */
function extent(draw: Draw): { line: LineRef; from: number; to: number } {
  if ('ghost' in draw) {
    const { at, len, tone } = draw.ghost
    return { line: draw.ghost, from: Math.min(...at), to: Math.max(...at) + (tone === 'bad' ? 0 : len - 1) }
  }
  return 'both' in draw ? { line: draw.both, ...draw.both } : { line: draw.bracket, ...draw.bracket }
}

/** Where each block of `line` can start, from the board before step `stepIndex`: `[block][placement]`. */
function blockStarts(lesson: Lesson, stepIndex: number, line: LineRef): number[][] {
  const { width, height, clues } = lessonPuzzle(lesson)
  const cells = cellsBefore(lesson, stepIndex, width, height)
  const [at, clue] =
    line.row !== undefined
      ? [Array.from({ length: width }, (_, c) => line.row * width + c), clues.rows[line.row]!]
      : [Array.from({ length: height }, (_, r) => r * width + line.col), clues.cols[line.col]!]
  const known = at.map((i): SolverCell => (cells[i] === 'filled' ? 'filled' : cells[i] === 'marked' ? 'empty' : 'unknown'))
  const starts = linePlacements(known, clue).map(p => p.flatMap((on, k) => (on && !p[k - 1] ? [k] : [])))
  return clue.map((_, b) => starts.map(s => s[b]!))
}

/** Whether a draw shows only what the board before the step allows. */
function honest(lesson: Lesson, stepIndex: number, draw: Draw): boolean {
  const { clues } = lessonPuzzle(lesson)
  const d = 'ghost' in draw ? draw.ghost : 'both' in draw ? draw.both : draw.bracket
  const clue = d.row !== undefined ? clues.rows[d.row]! : clues.cols[d.col!]!
  const blocks = blockStarts(lesson, stepIndex, d).map((starts, b) => ({ len: clue[b]!, lo: Math.min(...starts), hi: Math.max(...starts), starts }))
  if ('ghost' in draw) {
    const { at, len, tone } = draw.ghost
    const same = blocks.filter(b => b.len === len)
    if (tone === 'bad') return same.every(b => !b.starts.includes(at[0]))
    return same.some(b => b.lo === at[0] && b.hi === at[1])
  }
  if ('both' in draw) return blocks.some(b => b.hi === draw.both.from && b.lo + b.len - 1 === draw.both.to)
  return draw.bracket.from <= draw.bracket.to
}

describe.each(Object.values(TRACKS).map(t => [t.id, t] as const))('%s track', (_, track) => {
  it('has unique, URL-safe lesson ids', () => {
    const ids = track.lessons.map(l => l.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/)
  })
})

describe.each([...LESSONS, ...TECHNIQUES].map(l => [l.picture, l] as const))('%s', (_, lesson) => {
  const { width, height, clues, palette } = lessonPuzzle(lesson)

  it('has every dimension a multiple of 5 and every color in the palette', () => {
    expect(width % 5).toBe(0)
    expect(height % 5).toBe(0)
    expect(lesson.rows.every(r => r.length === width)).toBe(true)
    expect(palette).not.toContain(undefined)
  })

  it('is unique and solvable by line logic', () => {
    expect(isUnique(clues)).toBe(true)
    expect(isLogicSolvable(clues)).toBe(true)
  })

  it('ends on solving the picture, and only there', () => {
    const last = lesson.steps.length - 1
    expect(lesson.steps.findIndex(s => s.target === 'solved')).toBeOneOf([-1, last])
    if (lesson.steps[last]!.target === 'solved') return
    const placed = [lesson.given ?? {}, ...lesson.steps.flatMap(s => (s.target === 'solved' ? [] : [s.target]))]
    const filled = new Set(placed.flatMap(p => (p.filled ?? []).map(([r, c]) => r * width + c)))
    expect(palette.map((_, i) => filled.has(i))).toEqual(palette.map(c => c !== null))
  })

  it('gives only cells that agree with the picture, and leaves the first step to do', () => {
    const { filled = [], marked = [] } = lesson.given ?? {}
    for (const [r, c] of filled) expect(palette[r * width + c], `(${r}, ${c})`).not.toBeNull()
    for (const [r, c] of marked) expect(palette[r * width + c], `(${r}, ${c})`).toBeNull()
    expect(currentStep(lesson, cellsBefore(lesson, 0, width, height), width)).toBe(0)
  })

  lesson.steps.forEach((step, i) => {
    it(`step ${i + 1} has beats, and draws only in bounds on its highlighted lines`, () => {
      expect(step.beats.length).toBeGreaterThan(0)
      const { rows = [], cols = [] } = step.highlight
      for (const draw of step.beats.flatMap(b => b.draw ?? [])) {
        const { line, from, to } = extent(draw)
        const [lines, length] = line.row !== undefined ? [rows, width] : [cols, height]
        expect(lines).toContain(line.row ?? line.col)
        expect(from).toBeGreaterThanOrEqual(0)
        expect(to).toBeLessThan(length)
      }
    })

    it(`step ${i + 1} draws only what the board before it allows`, () => {
      for (const draw of step.beats.flatMap(b => b.draw ?? [])) expect(honest(lesson, i, draw), JSON.stringify(draw)).toBe(true)
    })

    if (step.target === 'solved') return
    const { filled = [], marked = [] } = step.target
    it(`step ${i + 1} asks only for cells its highlighted lines imply`, () => {
      const g = deducible(lesson, i)
      for (const [r, c] of filled) expect(g[r * width + c], `(${r}, ${c})`).toBe('filled')
      for (const [r, c] of marked) expect(g[r * width + c], `(${r}, ${c})`).toBe('empty')
    })
  })
})
