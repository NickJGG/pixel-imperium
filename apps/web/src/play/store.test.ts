import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cluesFromSolution } from '@pixel-imperium/nonogram'
import { stubStorage } from '../test-storage.ts'
import { ProgressStorage, signedOutStorage as storage } from './progress-storage.ts'
import { PlayStore, type Pos, type Tool, crosshairOf } from './store.ts'

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

  it('without axis lock fills a fast slanted jump along a straight line', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 0), at(1, 3)], false)
    expect(render(s)).toEqual(['##..', '..##', '....'])

    const d = makeStore()
    drag(d, 'fill', [at(0, 0), at(2, 2)], false)
    expect(render(d)).toEqual(['#...', '.#..', '..#.'])
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

describe('PlayStore assists', () => {
  // Row 2 and columns 2–3 have no clues.
  const sparse = ['.#..', '##..', '....'].flatMap(row => Array.from(row, ch => ch === '#'))
  const sparsePuzzle = { id: 'sparse', width: 4, height: 3, clues: cluesFromSolution(4, 3, sparse) }

  it('auto-marks clueless lines as the initial, non-undoable state', () => {
    const s = new PlayStore(sparsePuzzle, { autoMarkEmptyLines: true })
    expect(render(s)).toEqual(['..xx', '..xx', 'xxxx'])
    expect(s.getState().canUndo).toBe(false)
  })

  it('publishes a new cells array only when a cell changes', () => {
    const s = makeStore()
    const before = s.getState().cells
    s.moveCursor(1, 1)
    s.setHover(at(0, 0))
    expect(s.getState().cells).toBe(before)
    drag(s, 'fill', [at(0, 0)])
    expect(s.getState().cells).not.toBe(before)
  })

  it('crosshair follows hover, else the cursor while focused, and hides once solved', () => {
    const s = makeStore()
    expect(crosshairOf(s.getState())).toBeNull()
    s.setFocused(true)
    s.moveCursor(1, 2)
    expect(crosshairOf(s.getState())).toEqual(at(1, 2))
    s.setHover(at(0, 3))
    expect(crosshairOf(s.getState())).toEqual(at(0, 3))
    s.moveCursor(0, -1)
    expect(crosshairOf(s.getState())).toEqual(at(1, 1))
    drag(s, 'fill', [at(0, 1), at(2, 1)])
    drag(s, 'fill', [at(1, 0), at(1, 2)])
    expect(crosshairOf(s.getState())).toBeNull()
  })
})

describe('PlayStore clear', () => {
  it('empties the grid as one undo step', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 0), at(0, 2)])
    drag(s, 'mark', [at(2, 0), at(2, 3)])
    s.clear({ autoMarkEmptyLines: false })
    expect(render(s)).toEqual(['....', '....', '....'])
    s.undo()
    expect(render(s)).toEqual(['###.', '....', 'xxxx'])
  })

  it('re-applies auto-marks when the setting is on', () => {
    const sparse = ['.#..', '##..', '....'].flatMap(row => Array.from(row, ch => ch === '#'))
    const s = new PlayStore({ id: 'sparse', width: 4, height: 3, clues: cluesFromSolution(4, 3, sparse) })
    drag(s, 'fill', [at(0, 0), at(0, 1)])
    s.clear({ autoMarkEmptyLines: true })
    expect(render(s)).toEqual(['..xx', '..xx', 'xxxx'])
  })

  it('does nothing on an already fresh grid', () => {
    const s = makeStore()
    s.clear({ autoMarkEmptyLines: false })
    expect(s.getState().canUndo).toBe(false)
  })
})

function solve(store: PlayStore) {
  drag(store, 'fill', [at(0, 1), at(2, 1)])
  drag(store, 'fill', [at(1, 0), at(1, 2)])
}

describe('PlayStore persistence', () => {
  beforeEach(stubStorage)
  afterEach(() => vi.unstubAllGlobals())

  it('records the solve so the library can show it', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 1), at(2, 1)])
    expect(storage.loadSolved('test')).toBeNull()
    drag(s, 'fill', [at(1, 0), at(1, 2)])
    expect(storage.loadSolved('test')).toBe('local')
  })

  const palette = Array.from({ length: 12 }, (_, i) => (solution[i] ? '#f0f' : null))

  it('persists the palette', () => {
    const s = makeStore()
    solve(s)
    s.setPalette(palette)
    expect(storage.loadPalette('test', 12)).toEqual(palette)
  })

  it('clearing a solved puzzle starts a replay that keeps the solve', () => {
    const s = makeStore()
    solve(s)
    s.setPalette(palette)
    s.clear({ autoMarkEmptyLines: false })
    expect(s.getState()).toMatchObject({ solved: false, replaying: true, palette: null })
    expect(render(s)).toEqual(['....', '....', '....'])
    expect(storage.loadSolved('test')).toBe('local')
    expect(storage.loadReplay('test')).toBe(true)
    expect(makeStore().getState().replaying).toBe(true)
  })

  it('undoing a replay restores the solve and its palette', () => {
    const s = makeStore()
    solve(s)
    s.setPalette(palette)
    s.clear({ autoMarkEmptyLines: false })
    s.undo()
    expect(s.getState()).toMatchObject({ solved: true, replaying: false, palette })
    expect(storage.loadReplay('test')).toBe(false)
  })

  it('solving a replay again ends it', () => {
    const s = makeStore()
    solve(s)
    s.clear({ autoMarkEmptyLines: false })
    solve(s)
    expect(s.getState()).toMatchObject({ solved: true, replaying: false })
    expect(storage.loadReplay('test')).toBe(false)
  })

  it('loads the stored palette when it opens already solved', () => {
    const s = makeStore()
    solve(s)
    s.setPalette(palette)
    expect(makeStore().getState().palette).toEqual(palette)
  })
})

describe('PlayStore with an account', () => {
  beforeEach(stubStorage)
  afterEach(() => vi.unstubAllGlobals())

  const account = new ProgressStorage('u1')
  const palette = Array.from({ length: 12 }, (_, i) => (solution[i] ? '#f0f' : null))
  const accountStore = (onSave?: () => void) =>
    new PlayStore(
      { id: 'test', width: 4, height: 3, clues: cluesFromSolution(4, 3, solution) },
      { storage: account, onSave },
    )

  it("keeps its data apart from signed-out play's", () => {
    solve(accountStore())
    expect(account.loadSolved('test')).toBe('local')
    expect(storage.loadSolved('test')).toBeNull()
    expect(makeStore().getState().solved).toBe(false)
  })

  it('reports each saved edit', () => {
    const onSave = vi.fn()
    const s = accountStore(onSave)
    drag(s, 'fill', [at(0, 1)])
    s.undo()
    expect(onSave).toHaveBeenCalledTimes(2)
  })

  it('marks the solve verified once the server reveals it, and a replay keeps that', () => {
    const s = accountStore()
    solve(s)
    s.setPalette(palette)
    expect(account.loadSolved('test')).toBe('verified')
    s.clear({ autoMarkEmptyLines: false })
    solve(s)
    expect(account.loadSolved('test')).toBe('verified')
  })

  it('marks a re-solved unverified solve as awaiting the server', () => {
    account.saveSolved('test', 'unverified')
    solve(accountStore())
    expect(account.loadSolved('test')).toBe('local')
  })
})
