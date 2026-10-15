import { ProgressStorage } from './progress-storage.ts'

/** Starts empty and keeps nothing: a playtest leaves no trace in the player's own progress. */
export class PlaytestStorage extends ProgressStorage {
  constructor() {
    super(null)
  }

  override loadProgress(): null {
    return null
  }
  override loadSolved(): null {
    return null
  }
  override loadReplay(): boolean {
    return false
  }
  override loadPalette(): null {
    return null
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
