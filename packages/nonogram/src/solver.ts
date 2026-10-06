import type { Clues } from './grid.ts'

export type SolverCell = 'filled' | 'empty' | 'unknown'

/** Every assignment of `clues` to `line` consistent with its known cells; `true` = filled. */
export function linePlacements(line: readonly SolverCell[], clues: readonly number[]): boolean[][] {
  const n = line.length
  const result: boolean[][] = []
  const buf = Array<boolean>(n).fill(false)
  // suffix[i] = minimum span needed by clues[i..], including their separating gaps
  const suffix = Array<number>(clues.length + 1).fill(0)
  for (let i = clues.length - 1; i >= 0; i--) suffix[i] = suffix[i + 1]! + clues[i]! + (i < clues.length - 1 ? 1 : 0)

  function go(pos: number, ci: number) {
    if (ci === clues.length) {
      for (let i = pos; i < n; i++) {
        if (line[i] === 'filled') return
        buf[i] = false
      }
      result.push(buf.slice())
      return
    }
    const len = clues[ci]!
    const maxStart = n - suffix[ci]!
    for (let start = pos; start <= maxStart; start++) {
      // A filled cell before `start` would be left uncovered; later starts only skip more of it.
      if (start > pos && line[start - 1] === 'filled') break
      let fits = true
      for (let i = start; i < start + len; i++) {
        if (line[i] === 'empty') { fits = false; break }
      }
      if (!fits) continue
      if (start + len < n && line[start + len] === 'filled') continue
      for (let i = pos; i < start; i++) buf[i] = false
      for (let i = start; i < start + len; i++) buf[i] = true
      if (start + len < n) buf[start + len] = false
      go(start + len + 1, ci + 1)
    }
  }

  go(0, 0)
  return result
}

/** Whether any placement of `clues` fits `line`. O(n·k), unlike enumerating placements. */
export function lineFeasible(line: readonly SolverCell[], clues: readonly number[]): boolean {
  const n = line.length
  const k = clues.length
  // emptyBefore[i] = count of known-empty cells in line[0..i)
  const emptyBefore = Array<number>(n + 1).fill(0)
  for (let i = 0; i < n; i++) emptyBefore[i + 1] = emptyBefore[i]! + (line[i] === 'empty' ? 1 : 0)

  // fits[j][i]: clues[j..] can be placed in line[i..]
  const fits = Array.from({ length: k + 1 }, () => Array<boolean>(n + 1).fill(false))
  fits[k]![n] = true
  for (let i = n - 1; i >= 0; i--) fits[k]![i] = line[i] !== 'filled' && fits[k]![i + 1]!
  for (let j = k - 1; j >= 0; j--) {
    const len = clues[j]!
    for (let i = n - 1; i >= 0; i--) {
      const skip = line[i] !== 'filled' && fits[j]![i + 1]!
      const end = i + len
      const place = end <= n &&
        emptyBefore[end] === emptyBefore[i] &&
        (end === n || line[end] !== 'filled') &&
        fits[j + 1]![Math.min(end + 1, n)]!
      fits[j]![i] = skip || place
    }
  }
  return fits[0]![0]!
}

/** Cells forced by every placement, or `null` if the line is contradictory. */
export function lineSolve(line: readonly SolverCell[], clues: readonly number[]): SolverCell[] | null {
  const placements = linePlacements(line, clues)
  if (placements.length === 0) return null
  return line.map((cell, i) => {
    if (cell !== 'unknown') return cell
    if (placements.every(p => p[i])) return 'filled'
    if (placements.every(p => !p[i])) return 'empty'
    return 'unknown'
  })
}

interface PropagationResult {
  cells: SolverCell[] | null
  /** Cells resolved in each full row+column sweep, including the final sweep that resolves none. */
  resolvedPerPass: number[]
}

function runPropagation(clues: Clues, start: readonly SolverCell[]): PropagationResult {
  const width = clues.cols.length
  const height = clues.rows.length
  const g = start.slice()
  const resolvedPerPass: number[] = []
  let changed = true
  while (changed) {
    changed = false
    let resolved = 0
    for (let r = 0; r < height; r++) {
      const solved = lineSolve(g.slice(r * width, (r + 1) * width), clues.rows[r]!)
      if (!solved) return { cells: null, resolvedPerPass }
      for (let c = 0; c < width; c++) {
        const i = r * width + c
        if (g[i] === 'unknown' && solved[c] !== 'unknown') {
          g[i] = solved[c]!
          resolved++
        }
      }
    }
    for (let c = 0; c < width; c++) {
      const col = Array.from({ length: height }, (_, r) => g[r * width + c]!)
      const solved = lineSolve(col, clues.cols[c]!)
      if (!solved) return { cells: null, resolvedPerPass }
      for (let r = 0; r < height; r++) {
        const i = r * width + c
        if (g[i] === 'unknown' && solved[r] !== 'unknown') {
          g[i] = solved[r]!
          resolved++
        }
      }
    }
    resolvedPerPass.push(resolved)
    changed = resolved > 0
  }
  return { cells: g, resolvedPerPass }
}

function unknownGrid(clues: Clues): SolverCell[] {
  return Array<SolverCell>(clues.rows.length * clues.cols.length).fill('unknown')
}

/** Line-by-line deduction to a fixed point; `null` on contradiction. `cells` is row-major. */
export function propagate(clues: Clues, cells: readonly SolverCell[]): SolverCell[] | null {
  return runPropagation(clues, cells).cells
}

export function isLogicSolvable(clues: Clues): boolean {
  const g = propagate(clues, unknownGrid(clues))
  return g !== null && g.every(cell => cell !== 'unknown')
}

/** Row+column sweeps line logic needs to solve the grid, or `null` if it can't. */
export function logicPassCount(clues: Clues): number | null {
  const { cells, resolvedPerPass } = runPropagation(clues, unknownGrid(clues))
  if (!cells || cells.includes('unknown')) return null
  // The final sweep confirms the fixed point and resolves nothing.
  return resolvedPerPass.length - 1
}

export function isUnique(clues: Clues): boolean {
  let count = 0

  function search(grid: readonly SolverCell[]): boolean {
    const g = propagate(clues, grid)
    if (!g) return false
    const i = g.indexOf('unknown')
    if (i === -1) return ++count >= 2
    const filled = g.slice()
    filled[i] = 'filled'
    if (search(filled)) return true
    const empty = g.slice()
    empty[i] = 'empty'
    return search(empty)
  }

  search(unknownGrid(clues))
  return count === 1
}

/** 1 (easy) to 5 (hard); anything not solvable by line logic alone is 5. */
export function rateDifficulty(clues: Clues): number {
  const width = clues.cols.length
  const height = clues.rows.length
  const { cells, resolvedPerPass } = runPropagation(clues, unknownGrid(clues))
  if (!cells || cells.includes('unknown')) return 5

  const sizeFactor = Math.ceil(Math.max(width, height) / 5)
  const passFactor = Math.min(resolvedPerPass.length, 10) / 2
  // Many cells resolved in the first sweep means lots of obvious deductions.
  const firstPassRate = (resolvedPerPass[0] ?? 0) / (width * height)
  const rateFactor = 5 * (1 - firstPassRate)

  const raw = (sizeFactor + passFactor + rateFactor) / 3
  return Math.max(1, Math.min(5, Math.round(raw)))
}
