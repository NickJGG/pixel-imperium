import type { Cell } from '@pixel-imperium/nonogram'
import { ProgressStorage, type SolveMark } from '../play/progress-storage.ts'

/**
 * A player's own storage while in a party. The server keeps the shared grid, and the Host's progress from it, so
 * this player's own Attempt, clock and Best time are left alone. A signed-out guest's solve goes in the device's
 * album, as a solo one would; an account's only once the server has verified it. Never foil, and an Author on
 * their own puzzle keeps nothing.
 */
export class PartyStorage extends ProgressStorage {
  constructor(
    userId: string | null,
    private readonly grid: () => readonly Cell[],
    private readonly own: boolean,
  ) {
    super(userId)
  }

  override loadProgress(_puzzleId: string, length: number): Cell[] | null {
    const cells = this.grid()
    return cells.length === length ? [...cells] : null
  }
  override loadReplay(): boolean {
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
  override saveSolved(puzzleId: string, mark: SolveMark): void {
    if (!this.own && (this.userId === null || mark === 'verified')) super.saveSolved(puzzleId, mark)
  }
  override saveSolvedAt(puzzleId: string, iso: string): void {
    if (!this.own) super.saveSolvedAt(puzzleId, iso)
  }
  /** Only a first solve settles foil, and a party's is never foil. */
  override saveFoil(puzzleId: string): void {
    if (!this.own && this.loadSolved(puzzleId) === null) super.saveFoil(puzzleId, false)
  }
  override savePalette(puzzleId: string, palette: readonly (string | null)[]): void {
    if (!this.own) super.savePalette(puzzleId, palette)
  }
  override saveCrest(puzzleId: string, hex: string): void {
    if (!this.own) super.saveCrest(puzzleId, hex)
  }
  override saveProgress(): void {}
  override saveCells(): void {}
  override saveReplay(): void {}
  override clearReplay(): void {}
  override saveHinted(): void {}
  override saveElapsed(): void {}
  override saveAttemptHinted(): void {}
  override saveBest(): void {}
}
