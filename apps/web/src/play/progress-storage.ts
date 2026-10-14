/**
 * Per-puzzle play data in localStorage, namespaced by player: signed-out keys are
 * `pixel-imperium:<kind>:<id>`, an account's cache is `pixel-imperium:u:<userId>:<kind>:<id>`.
 * Storage can be missing or throw (private mode, blocked site data); data is then just not kept.
 */
import type { Cell } from '@pixel-imperium/nonogram'
import type { SolveStatus } from '@pixel-imperium/protocol'

const encode: Record<Cell, string> = { empty: '.', filled: '#', marked: 'x' }
const decode: Record<string, Cell> = { '.': 'empty', '#': 'filled', x: 'marked' }

export const encodeCells = (cells: readonly Cell[]): string => cells.map(c => encode[c]).join('')

const KINDS = [
  'progress',
  'solved',
  'replay',
  'palette',
  'updated',
  'foil',
  'hinted',
  'solved-at',
  'crest',
  'elapsed',
  'best',
  'attempt-hinted',
] as const
type Kind = (typeof KINDS)[number]

/** `local`: solved on this device, not (yet) confirmed by the server for an account. */
export type SolveMark = 'local' | SolveStatus

const solveMarks: Record<string, SolveMark> = { '1': 'local', verified: 'verified', unverified: 'unverified' }

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {}
}

function allKeys(): string[] {
  try {
    return Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter(k => k !== null)
  } catch {
    return []
  }
}

export class ProgressStorage {
  private readonly prefix: string

  constructor(readonly userId: string | null) {
    this.prefix = userId === null ? 'pixel-imperium:' : `pixel-imperium:u:${userId}:`
  }

  private key(kind: Kind, puzzleId: string): string {
    return `${this.prefix}${kind}:${puzzleId}`
  }

  loadProgress(puzzleId: string, length: number): Cell[] | null {
    const raw = this.loadCells(puzzleId)
    if (raw === null || raw.length !== length) return null
    const cells = Array.from(raw, ch => decode[ch])
    return cells.every(c => c !== undefined) ? (cells as Cell[]) : null
  }

  /** The grid as stored, `.#x` encoded. */
  loadCells(puzzleId: string): string | null {
    return read(this.key('progress', puzzleId))
  }

  saveProgress(puzzleId: string, cells: readonly Cell[]): void {
    this.saveCells(puzzleId, encodeCells(cells), new Date().toISOString())
  }

  saveCells(puzzleId: string, cells: string, updatedAt: string): void {
    write(this.key('progress', puzzleId), cells)
    write(this.key('updated', puzzleId), updatedAt)
  }

  /** When the grid last changed, for last-write-wins sync. */
  loadUpdatedAt(puzzleId: string): string | null {
    return read(this.key('updated', puzzleId))
  }

  /** Lets the library tell a finished grid from one in progress without the puzzle's clues. */
  loadSolved(puzzleId: string): SolveMark | null {
    return solveMarks[read(this.key('solved', puzzleId)) ?? ''] ?? null
  }

  saveSolved(puzzleId: string, mark: SolveMark): void {
    write(this.key('solved', puzzleId), mark === 'local' ? '1' : mark)
  }

  /** When the puzzle was first solved, as an ISO time. */
  loadSolvedAt(puzzleId: string): string | null {
    return read(this.key('solved-at', puzzleId))
  }

  /** Keeps the first date: a later solve never moves it. */
  saveSolvedAt(puzzleId: string, iso: string): void {
    if (this.loadSolvedAt(puzzleId) === null) write(this.key('solved-at', puzzleId), iso)
  }

  /** Set while a solved puzzle has been cleared to play again; the solved flag stays. */
  loadReplay(puzzleId: string): boolean {
    return read(this.key('replay', puzzleId)) === '1'
  }

  saveReplay(puzzleId: string): void {
    write(this.key('replay', puzzleId), '1')
  }

  clearReplay(puzzleId: string): void {
    write(this.key('replay', puzzleId), null)
  }

  /** The server's reveal colors, kept so the library can draw solved art without re-solving. */
  loadPalette(puzzleId: string, length: number): (string | null)[] | null {
    let palette: unknown
    try {
      palette = JSON.parse(read(this.key('palette', puzzleId)) ?? 'null')
    } catch {
      return null
    }
    return Array.isArray(palette) &&
      palette.length === length &&
      palette.every(c => c === null || typeof c === 'string')
      ? palette
      : null
  }

  savePalette(puzzleId: string, palette: readonly (string | null)[]): void {
    write(this.key('palette', puzzleId), JSON.stringify(palette))
  }

  /** The puzzle's Crest pixel colour, released with its palette. */
  loadCrest(puzzleId: string): string | null {
    return read(this.key('crest', puzzleId))
  }

  saveCrest(puzzleId: string, hex: string): void {
    write(this.key('crest', puzzleId), hex)
  }

  /** Decided at the first solve and kept through replays. */
  loadFoil(puzzleId: string): boolean {
    return read(this.key('foil', puzzleId)) === '1'
  }

  saveFoil(puzzleId: string, foil: boolean): void {
    write(this.key('foil', puzzleId), foil ? '1' : null)
  }

  /** A hint was given on the puzzle, so its first solve won't be foil. */
  loadHinted(puzzleId: string): boolean {
    return read(this.key('hinted', puzzleId)) === '1'
  }

  saveHinted(puzzleId: string): void {
    write(this.key('hinted', puzzleId), '1')
  }

  /** Active time on the current Attempt, in ms. */
  loadElapsed(puzzleId: string): number {
    return Number(read(this.key('elapsed', puzzleId))) || 0
  }

  /** Moves `updated` too, so last-write-wins sync carries the time. */
  saveElapsed(puzzleId: string, ms: number, updatedAt = new Date().toISOString()): void {
    write(this.key('elapsed', puzzleId), ms > 0 ? String(Math.round(ms)) : null)
    write(this.key('updated', puzzleId), updatedAt)
  }

  /** A Hint was used in the current Attempt, so its solve can't set a Best time. */
  loadAttemptHinted(puzzleId: string): boolean {
    return read(this.key('attempt-hinted', puzzleId)) === '1'
  }

  /** Moves `updated` too, like `saveElapsed`. */
  saveAttemptHinted(puzzleId: string, hinted: boolean, updatedAt = new Date().toISOString()): void {
    write(this.key('attempt-hinted', puzzleId), hinted ? '1' : null)
    write(this.key('updated', puzzleId), updatedAt)
  }

  /** The fastest unhinted Solve time, in ms. */
  loadBest(puzzleId: string): number | null {
    const ms = Number(read(this.key('best', puzzleId)) ?? NaN)
    return Number.isFinite(ms) && ms >= 0 ? ms : null
  }

  /** Keeps the lower of `ms` and the stored best. */
  saveBest(puzzleId: string, ms: number): void {
    const best = this.loadBest(puzzleId)
    if (best === null || ms < best) write(this.key('best', puzzleId), String(Math.round(ms)))
  }

  /** Every puzzle with a saved grid, solve or hint. */
  puzzleIds(): string[] {
    const ids = new Set<string>()
    for (const k of allKeys()) {
      for (const kind of ['progress', 'solved', 'hinted'] as const) {
        const start = `${this.prefix}${kind}:`
        if (k.startsWith(start)) ids.add(k.slice(start.length))
      }
    }
    return [...ids]
  }

  /** Removes every puzzle's data, leaving other keys (settings, other namespaces, metadata) alone. */
  clear(): void {
    const starts = KINDS.map(kind => `${this.prefix}${kind}:`)
    for (const k of allKeys()) if (starts.some(s => k.startsWith(s))) write(k, null)
  }

  /** Removes the whole account namespace, metadata included. */
  forget(): void {
    if (this.userId === null) throw new Error('the signed-out namespace shares its prefix with every other key')
    for (const k of allKeys()) if (k.startsWith(this.prefix)) write(k, null)
  }

  /** The account's showcase picks as last pulled; signed out, always empty. */
  loadShowcase(): string[] {
    try {
      const ids: unknown = JSON.parse(this.loadMeta('showcase') ?? '[]')
      return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []
    } catch {
      return []
    }
  }

  saveShowcase(puzzleIds: readonly string[]): void {
    this.saveMeta('showcase', puzzleIds.length > 0 ? JSON.stringify(puzzleIds) : null)
  }

  /** Namespace-wide values outside any puzzle, such as the sync's dirty set. */
  loadMeta(name: string): string | null {
    return read(`${this.prefix}meta:${name}`)
  }

  saveMeta(name: string, value: string | null): void {
    write(`${this.prefix}meta:${name}`, value)
  }
}

export const signedOutStorage = new ProgressStorage(null)
