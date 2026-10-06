import { describe, expect, it } from 'vitest'
import { cluesFromSolution } from '@pixel-imperium/nonogram'
import { PlayStore, type Pos, type Tool } from './store.ts'

// 4×3 plus sign with a tail:
//   .#..
//   ###.
//   .#..
const solution = ['.#..', '###.', '.#..'].flatMap(row => Array.from(row, ch => ch === '#'))

function makeStore() {
  return new PlayStore({ id: 'test', width: 4, height: 3, clues: cluesFromSolution(4, 3, solution) })
}

function render(store: PlayStore): string[] {
  const ch = { empty: '.', filled: '#', marked: 'x' } as const
  const { cells } = store.getState()
  return [0, 1, 2].map(r => cells.slice(r * 4, r * 4 + 4).map(c => ch[c]).join(''))
}

function drag(store: PlayStore, tool: Tool, path: Pos[], lockAxis = true) {
  store.beginStroke(path[0]!, tool, { lockAxis })
  for (const p of path.slice(1)) store.extendStroke(p)
  store.endStroke()
}

const at = (row: number, col: number): Pos => ({ row, col })

describe('PlayStore strokes', () => {
  it('paints the tool state onto empty cells', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 0), at(0, 2)])
    expect(render(s)).toEqual(['###.', '....', '....'])
  })

  it('interpolates skipped cells on a fast drag', () => {
    const s = makeStore()
    drag(s, 'mark', [at(1, 0), at(1, 3)])
    expect(render(s)[1]).toBe('xxxx')
  })

  it('locks to the first axis left and projects onto it', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 0), at(0, 1), at(2, 2)])
    expect(render(s)).toEqual(['###.', '....', '....'])

    const v = makeStore()
    drag(v, 'fill', [at(0, 0), at(2, 1)])
    expect(render(v)).toEqual(['#...', '#...', '#...'])
  })

  it('without axis lock follows the path cell by cell', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 0), at(0, 1), at(1, 1)], false)
    expect(render(s)).toEqual(['##..', '.#..', '....'])
  })

  it('erases when the first cell already holds the tool state', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 0), at(0, 3)])
    drag(s, 'fill', [at(0, 1), at(0, 2)])
    expect(render(s)[0]).toBe('#..#')
  })

  it('never lets marks and fills overwrite each other', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 1)])
    drag(s, 'mark', [at(0, 0), at(0, 3)])
    expect(render(s)[0]).toBe('x#xx')

    // Erasing marks leaves the fill alone.
    drag(s, 'mark', [at(0, 0), at(0, 3)])
    expect(render(s)[0]).toBe('.#..')

    // Starting on the other state is a no-op stroke.
    drag(s, 'mark', [at(0, 1), at(0, 3)])
    expect(render(s)[0]).toBe('.#..')
    expect(s.getState().canUndo).toBe(true)
    s.undo()
    s.undo()
    expect(render(s)[0]).toBe('.#..')
  })

  it('undoes and redoes whole strokes', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 0), at(0, 3)])
    drag(s, 'mark', [at(2, 0), at(2, 3)])
    s.undo()
    expect(render(s)).toEqual(['####', '....', '....'])
    s.undo()
    expect(render(s)).toEqual(['....', '....', '....'])
    expect(s.getState().canUndo).toBe(false)
    s.redo()
    expect(render(s)).toEqual(['####', '....', '....'])
    drag(s, 'fill', [at(1, 0)])
    expect(s.getState().canRedo).toBe(false)
  })

  it('moving the cursor during a stroke paints along the way', () => {
    const s = makeStore()
    s.beginStroke(s.getState().cursor, 'fill', { lockAxis: false })
    s.moveCursor(0, 1)
    s.moveCursor(1, 0)
    s.endStroke()
    s.moveCursor(0, 1)
    expect(render(s)).toEqual(['##..', '.#..', '....'])
    expect(s.getState().cursor).toEqual(at(1, 2))
  })

  it('clamps the cursor to the grid', () => {
    const s = makeStore()
    s.moveCursor(-1, -1)
    expect(s.getState().cursor).toEqual(at(0, 0))
    s.moveCursor(10, 10)
    expect(s.getState().cursor).toEqual(at(2, 3))
  })
})

describe('PlayStore win', () => {
  it('solves once the clues are satisfied, ignoring marks, then locks edits', () => {
    const s = makeStore()
    drag(s, 'mark', [at(0, 0)])
    drag(s, 'fill', [at(0, 1), at(2, 1)])
    expect(s.getState().solved).toBe(false)
    drag(s, 'fill', [at(1, 0), at(1, 2)])
    expect(s.getState().solved).toBe(true)

    drag(s, 'fill', [at(2, 3)])
    s.undo()
    expect(render(s)).toEqual(['x#..', '###.', '.#..'])
  })
})
