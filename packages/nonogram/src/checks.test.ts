import { describe, expect, it } from 'vitest'
import { check, meetsRules } from './checks.ts'

function checkRows(rows: string[]) {
  return check(rows[0]!.length, rows.length, [...rows.join('')].map(ch => ch === '#'))
}

describe('check', () => {
  it('passes a picture line logic solves', () => {
    const checks = checkRows(['.#.#.', '#####', '#####', '.###.', '..#..'])
    expect(checks).toMatchObject({ width: 5, height: 5, unique: true, stuck: [] })
    expect(checks.passes).toBeGreaterThanOrEqual(1)
    expect(checks.rating).toBeGreaterThanOrEqual(1)
  })

  it('hatches the cells that swap for a second solution', () => {
    expect(checkRows(['#.', '.#'])).toEqual({ width: 2, height: 2, unique: false, passes: null, rating: null, stuck: [0, 1, 2, 3] })
  })

  it('hatches what line logic leaves when the picture is unique but stalls', () => {
    const checks = checkRows(['#.#..', '..##.', '..#.#', '....#', '##.#.'])
    expect(checks.unique).toBe(true)
    expect(checks.passes).toBeNull()
    expect(checks.rating).toBeNull()
    expect(checks.stuck.length).toBeGreaterThan(0)
  })
})

describe('meetsRules', () => {
  const heart = checkRows(['.#.#.', '#####', '#####', '.###.', '..#..'])

  it('passes a unique, logic-solvable picture of any size from 5 to 30', () => {
    expect(meetsRules(heart, 1)).toBe(true)
    expect(meetsRules({ ...heart, width: 7, height: 30 }, 10)).toBe(true)
  })

  it.each([
    ['too small', { width: 4 }, 1],
    ['too big', { height: 31 }, 1],
    ['two solutions', { unique: false }, 1],
    ['stalling', { passes: null }, 1],
    ['too many colors', {}, 11],
  ])('refuses one %s', (_, change, colors) => {
    expect(meetsRules({ ...heart, ...change }, colors)).toBe(false)
  })
})
