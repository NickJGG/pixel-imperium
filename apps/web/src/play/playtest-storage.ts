import { ProgressStorage, type SolveMark } from './progress-storage.ts'

/**
 * Starts empty and keeps nothing: a playtest leaves no trace in the player's own progress. A campaign playtest
 * passes `solves`, its puzzles' revealed pictures by id, so its provinces unlock as they would for a player.
 */
export class PlaytestStorage extends ProgressStorage {
  constructor(private readonly solves: ReadonlyMap<string, readonly (string | null)[]> = new Map()) {
    super(null)
  }

  override loadProgress(): null {
    return null
  }
  override loadCells(): null {
    return null
  }
  override loadSolved(puzzleId: string): SolveMark | null {
    return this.solves.has(puzzleId) ? 'local' : null
  }
  override loadReplay(): boolean {
    return false
  }
  override loadPalette(puzzleId: string): (string | null)[] | null {
    const palette = this.solves.get(puzzleId)
    return palette ? [...palette] : null
  }
  override loadCrest(): null {
    return null
  }
  override loadFoil(): boolean {
    return false
  }
  override loadHinted(): boolean {
    return false
  }
  override loadElapsed(): number {
    return 0
  }
  override loadAttemptHinted(): boolean {
    return false
  }
  override loadBest(): null {
    return null
  }
  override saveProgress(): void {}
  override saveCells(): void {}
  override saveSolved(): void {}
  override saveSolvedAt(): void {}
  override saveReplay(): void {}
  override clearReplay(): void {}
  override savePalette(): void {}
  override saveCrest(): void {}
  override saveFoil(): void {}
  override saveHinted(): void {}
  override saveElapsed(): void {}
  override saveAttemptHinted(): void {}
  override saveBest(): void {}
}
