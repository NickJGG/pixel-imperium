import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cluesFromSolution } from '@pixel-imperium/nonogram'
import { stubStorage } from '../test-storage.ts'
import { ProgressStorage, signedOutStorage as storage } from './progress-storage.ts'
import { PlayStore, type Pos, type Tool, crosshairOf, elapsedAt } from './store.ts'

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

  it('cancels a stroke without an undo step or a save', () => {
    const onSave = vi.fn()
    const s = new PlayStore(makeStore().puzzle, { onSave })
    drag(s, 'fill', [at(0, 0)])
    s.beginStroke(at(2, 0), 'mark', { lockAxis: true })
    s.extendStroke(at(2, 3))
    expect(render(s)).toEqual(['#...', '....', 'xxxx'])
    s.cancelStroke()
    expect(render(s)).toEqual(['#...', '....', '....'])
    expect(s.strokeActive).toBe(false)
    expect(onSave).toHaveBeenCalledTimes(1)
    s.undo()
    expect(render(s)).toEqual(['....', '....', '....'])
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

  it('wraps the cursor round the edges when asked', () => {
    const s = makeStore()
    s.moveCursor(0, -1, true)
    expect(s.getState().cursor).toEqual(at(0, 3))
    s.moveCursor(-1, 0, true)
    expect(s.getState().cursor).toEqual(at(2, 3))
    s.moveCursor(1, 1, true)
    expect(s.getState().cursor).toEqual(at(0, 0))
  })

  it('wraps mid-stroke by jumping, painting only the cell it lands on', () => {
    const s = makeStore()
    s.beginStroke(s.getState().cursor, 'fill', { lockAxis: true })
    s.moveCursor(0, -1, true)
    s.moveCursor(0, -1, true)
    s.endStroke()
    expect(s.getState().cursor).toEqual(at(0, 2))
    expect(render(s)).toEqual(['#.##', '....', '....'])
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
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('records the solve so the library can show it', () => {
    const s = makeStore()
    drag(s, 'fill', [at(0, 1), at(2, 1)])
    expect(storage.loadSolved('test')).toBeNull()
    drag(s, 'fill', [at(1, 0), at(1, 2)])
    expect(storage.loadSolved('test')).toBe('local')
  })

  const palette = Array.from({ length: 12 }, (_, i) => (solution[i] ? '#f0f' : null))

  it('persists the palette and crest colour', () => {
    const s = makeStore()
    solve(s)
    s.setPalette(palette, null, '#abc')
    expect(storage.loadPalette('test', 12)).toEqual(palette)
    expect(storage.loadCrest('test')).toBe('#abc')
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

  it('makes a first solve foil only without a hint, and never changes it after', () => {
    solve(makeStore())
    expect(storage.loadFoil('test')).toBe(true)
    const replay = makeStore()
    replay.clear({ autoMarkEmptyLines: false })
    replay.showHint({ kind: 'reveal', index: 1 })
    solve(replay)
    expect(storage.loadFoil('test')).toBe(true)

    storage.clear()
    const hinted = makeStore()
    hinted.showHint({ kind: 'mistake', index: 0 })
    expect(hinted.getState()).toMatchObject({ hint: { kind: 'mistake', index: 0 }, hinted: true })
    solve(hinted)
    expect(storage.loadFoil('test')).toBe(false)
    expect(makeStore().getState().hinted).toBe(true)
  })

  it('dates the first solve, and a re-solve keeps that date', () => {
    vi.useFakeTimers({ now: new Date('2026-01-01T00:00:00.000Z'), toFake: ['Date'] })
    const s = makeStore()
    solve(s)
    expect(storage.loadSolvedAt('test')).toBe('2026-01-01T00:00:00.000Z')
    vi.setSystemTime(new Date('2026-02-01T00:00:00.000Z'))
    s.clear({ autoMarkEmptyLines: false })
    solve(s)
    expect(storage.loadSolvedAt('test')).toBe('2026-01-01T00:00:00.000Z')
  })

  it('drops the hint on show at the next edit', () => {
    const s = makeStore()
    s.showHint({ kind: 'reveal', index: 1 })
    drag(s, 'fill', [at(0, 1)])
    expect(s.getState()).toMatchObject({ hint: null, hinted: true })
  })

  it('loads the stored palette when it opens already solved', () => {
    const s = makeStore()
    solve(s)
    s.setPalette(palette)
    expect(makeStore().getState().palette).toEqual(palette)
  })
})

describe('PlayStore clock', () => {
  beforeEach(stubStorage)
  afterEach(() => vi.unstubAllGlobals())

  let t: number
  beforeEach(() => (t = 1_000))
  const clocked = () =>
    new PlayStore({ id: 'test', width: 4, height: 3, clues: cluesFromSolution(4, 3, solution) }, { now: () => t })
  const elapsed = (s: PlayStore) => elapsedAt(s.getState(), t)
  /** Solves in two strokes, `ms` apart. */
  const solveIn = (s: PlayStore, ms: number) => {
    drag(s, 'fill', [at(0, 1), at(2, 1)])
    t += ms
    drag(s, 'fill', [at(1, 0), at(1, 2)])
  }

  it('starts on the first stroke, not on opening', () => {
    const s = clocked()
    t += 5_000
    s.moveCursor(1, 1)
    expect(elapsed(s)).toBe(0)
    drag(s, 'fill', [at(0, 0)])
    t += 3_000
    expect(elapsed(s)).toBe(3_000)
  })

  it('pauses, and resumes on resume() or board input', () => {
    const s = clocked()
    drag(s, 'fill', [at(0, 0)])
    t += 2_000
    s.pause()
    t += 60_000
    expect(s.getState()).toMatchObject({ paused: true })
    expect(elapsed(s)).toBe(2_000)
    s.resume()
    t += 1_000
    expect(elapsed(s)).toBe(3_000)
    s.pause()
    drag(s, 'fill', [at(0, 1)])
    t += 1_000
    expect(s.getState().paused).toBe(false)
    expect(elapsed(s)).toBe(4_000)
  })

  it("doesn't count time while suspended, and wakes only what suspend stopped", () => {
    const s = clocked()
    s.suspend()
    s.wake()
    expect(s.getState().runningSince).toBeNull()

    drag(s, 'fill', [at(0, 0)])
    t += 1_000
    s.suspend()
    t += 30_000
    s.wake()
    t += 1_000
    expect(elapsed(s)).toBe(2_000)

    s.pause()
    s.suspend()
    s.wake()
    expect(s.getState()).toMatchObject({ paused: true, runningSince: null })
  })

  it('restarts the Attempt on clear, hint flag and all', () => {
    const s = clocked()
    drag(s, 'fill', [at(0, 0)])
    s.showHint({ kind: 'mistake', index: 0 })
    t += 4_000
    s.clear({ autoMarkEmptyLines: false })
    t += 4_000
    expect(elapsed(s)).toBe(0)
    expect(s.getState().attemptHinted).toBe(false)
    expect(storage.loadAttemptHinted('test')).toBe(false)
    drag(s, 'fill', [at(0, 0)])
    t += 1_000
    expect(elapsed(s)).toBe(1_000)
  })

  it('stops on the solve and sets the best, clearing the stored Attempt for a replay', () => {
    const s = clocked()
    solveIn(s, 7_000)
    t += 10_000
    expect(s.getState()).toMatchObject({ solved: true, solveMs: 7_000, bestMs: 7_000, runningSince: null })
    expect(storage.loadBest('test')).toBe(7_000)
    expect(storage.loadElapsed('test')).toBe(0)
  })

  it("doesn't set a best from a hinted Attempt, though the time still shows", () => {
    const s = clocked()
    drag(s, 'fill', [at(0, 0)])
    s.showHint({ kind: 'mistake', index: 0 })
    drag(s, 'fill', [at(0, 0)])
    solveIn(s, 7_000)
    expect(s.getState()).toMatchObject({ solved: true, solveMs: 7_000, bestMs: null, attemptHinted: true })
    expect(storage.loadBest('test')).toBeNull()
  })

  it('lowers the best only on a faster replay', () => {
    const s = clocked()
    solveIn(s, 7_000)
    s.clear({ autoMarkEmptyLines: false })
    solveIn(s, 9_000)
    expect(s.getState()).toMatchObject({ solveMs: 9_000, bestMs: 7_000 })
    s.clear({ autoMarkEmptyLines: false })
    solveIn(s, 4_000)
    expect(s.getState()).toMatchObject({ solveMs: 4_000, bestMs: 4_000 })
  })

  it('keeps the Attempt time and hint across a new store over the same storage', () => {
    const s = clocked()
    drag(s, 'fill', [at(0, 0)])
    s.showHint({ kind: 'mistake', index: 0 })
    t += 6_000
    s.suspend()
    const reopened = clocked()
    expect(reopened.getState()).toMatchObject({ elapsedMs: 6_000, runningSince: null, attemptHinted: true })
    drag(reopened, 'fill', [at(0, 2)])
    t += 1_000
    expect(elapsed(reopened)).toBe(7_000)
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

  it('marks a re-solved unverified solve as awaiting the server, never foil', () => {
    account.saveSolved('test', 'unverified')
    solve(accountStore())
    expect(account.loadSolved('test')).toBe('local')
    expect(account.loadFoil('test')).toBe(false)
  })

  it("takes the server's word on foil", () => {
    const s = accountStore()
    solve(s)
    expect(account.loadFoil('test')).toBe(true)
    s.setPalette(palette, false)
    expect(account.loadFoil('test')).toBe(false)
  })
})
