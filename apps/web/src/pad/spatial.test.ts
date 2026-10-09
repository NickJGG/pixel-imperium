import { describe, expect, it } from 'vitest'
import { type Rect, innermost, pickNext } from './spatial.ts'

/** A 3×2 grid of 100px slots with 20px gaps, named by row and column. */
const slot = (row: number, col: number) => ({
  name: `${row}${col}`,
  left: col * 120,
  top: row * 120,
  right: col * 120 + 100,
  bottom: row * 120 + 100,
})
const grid = [0, 1].flatMap(row => [0, 1, 2].map(col => slot(row, col)))
const from = (row: number, col: number): Rect => slot(row, col)
const others = (row: number, col: number) => grid.filter(s => s.name !== `${row}${col}`)

describe('pickNext', () => {
  it('moves to the neighbour in each direction', () => {
    expect(pickNext(from(0, 1), 'Down', others(0, 1))?.name).toBe('11')
    expect(pickNext(from(1, 1), 'Up', others(1, 1))?.name).toBe('01')
    expect(pickNext(from(0, 1), 'Right', others(0, 1))?.name).toBe('02')
    expect(pickNext(from(0, 1), 'Left', others(0, 1))?.name).toBe('00')
  })

  it("doesn't wrap at the edges", () => {
    expect(pickNext(from(0, 2), 'Right', others(0, 2))).toBeNull()
    expect(pickNext(from(1, 0), 'Down', others(1, 0))).toBeNull()
    expect(pickNext(from(0, 0), 'Up', others(0, 0))).toBeNull()
  })

  it('prefers the nearest in the direction over a closer one off to the side', () => {
    const near = { name: 'near', left: 300, top: 40, right: 340, bottom: 60 }
    const aside = { name: 'aside', left: 120, top: 200, right: 160, bottom: 220 }
    expect(pickNext({ left: 0, top: 0, right: 100, bottom: 100 }, 'Right', [aside, near])?.name).toBe('near')
  })

  it('counts a wide target spanning the centre as straight ahead', () => {
    const bar = { name: 'bar', left: -500, top: 400, right: 1000, bottom: 440 }
    expect(pickNext(from(1, 2), 'Down', [bar])?.name).toBe('bar')
  })
})

/** A stand-in for an element: it contains itself and its descendants. */
class Box {
  constructor(readonly parent: Box | null = null) {}
  contains(other: unknown): boolean {
    for (let at = other instanceof Box ? other : null; at; at = at.parent) if (at === this) return true
    return false
  }
}

describe('innermost', () => {
  it('picks a scope nested in another', () => {
    const menu = new Box()
    const confirm = new Box(menu)
    expect(innermost([menu, confirm], null)).toBe(confirm)
    expect(innermost([confirm, menu], null)).toBe(confirm)
  })

  it('prefers the scope holding focus, else the last open', () => {
    const a = new Box()
    const b = new Box()
    expect(innermost([a, b], new Box(a))).toBe(a)
    expect(innermost([a, b], null)).toBe(b)
  })

  it('is null with nothing open', () => {
    expect(innermost([], null)).toBeNull()
  })
})
