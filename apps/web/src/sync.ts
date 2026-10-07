/**
 * Keeps an account's local cache and the server in step. Every edit is saved locally first;
 * edited puzzles join a dirty set (persisted, so it survives reloads and offline spells) that
 * is sent after a pause in play, or immediately when the page is hidden. The server keeps
 * whichever grid has the later `updatedAt`.
 */
import type { MyProgress, SavedProgress, SolveRequest, SolveResponse } from '@pixel-imperium/protocol'
import type { ProgressStorage } from './play/progress-storage.ts'

export interface SyncApi {
  fetchProgress(): Promise<MyProgress>
  /** Rejects when the write should be retried later (offline, signed out, server error). */
  putProgress(id: string, body: SavedProgress, keepalive: boolean): Promise<unknown>
  solve(id: string, body: SolveRequest): Promise<SolveResponse>
}

export const SYNC_DELAY_MS = 1500

export class ProgressSync {
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly storage: ProgressStorage,
    private readonly api: SyncApi,
    private readonly delayMs = SYNC_DELAY_MS,
  ) {}

  markDirty(puzzleId: string): void {
    const dirty = this.dirty()
    if (!dirty.includes(puzzleId)) this.saveDirty([...dirty, puzzleId])
    this.cancelTimer()
    this.timer = setTimeout(() => void this.flush(), this.delayMs)
  }

  /** Sends every dirty grid; `false` if any could not be sent and is still waiting. */
  async flush({ keepalive = false } = {}): Promise<boolean> {
    this.cancelTimer()
    const results = await Promise.all(
      this.dirty().map(async id => {
        const cells = this.storage.loadCells(id)
        const updatedAt = this.storage.loadUpdatedAt(id)
        if (cells !== null && updatedAt !== null) {
          try {
            await this.api.putProgress(id, { cells, replaying: this.storage.loadReplay(id), updatedAt }, keepalive)
          } catch {
            return false
          }
          // Edited again while the request was out: that newer grid still has to go.
          if (this.storage.loadUpdatedAt(id) !== updatedAt) return true
        }
        this.saveDirty(this.dirty().filter(d => d !== id))
        return true
      }),
    )
    return results.every(Boolean)
  }

  /** Re-submits grids solved while the server could not be reached, so they become verified. */
  async verifyLocalSolves(): Promise<void> {
    const pending = this.storage.puzzleIds().filter(id => this.storage.loadSolved(id) === 'local')
    for (const id of pending) {
      const cells = this.storage.loadCells(id)
      if (cells === null) continue
      try {
        const res = await this.api.solve(id, { cells: Array.from(cells, ch => (ch === '#' ? 'filled' : 'empty')) })
        if (!res.solved) continue
        this.storage.saveSolved(id, 'verified')
        this.storage.savePalette(id, res.palette)
        if (res.foil !== null) this.storage.saveFoil(id, res.foil)
      } catch {}
    }
  }

  /**
   * Sends local changes, then replaces the cache with the account's data. Returns that data,
   * or `null` when offline, leaving the cache as it was.
   */
  async pull(): Promise<MyProgress | null> {
    if (!(await this.flush())) return null
    await this.verifyLocalSolves()
    let data: MyProgress
    try {
      data = await this.api.fetchProgress()
    } catch {
      return null
    }
    this.storage.clear()
    for (const [id, { solved, progress, palette, foil, hinted }] of Object.entries(data.puzzles)) {
      if (progress) {
        this.storage.saveCells(id, progress.cells, progress.updatedAt)
        if (progress.replaying) this.storage.saveReplay(id)
      }
      if (solved) this.storage.saveSolved(id, solved)
      if (palette) this.storage.savePalette(id, palette)
      if (foil) this.storage.saveFoil(id, true)
      if (hinted) this.storage.saveHinted(id)
    }
    this.storage.saveShowcase(data.showcase)
    return data
  }

  /** After coming back online: everything a pull sends, without replacing the cache under live play. */
  async reconnect(): Promise<void> {
    if (await this.flush()) await this.verifyLocalSolves()
  }

  dispose(): void {
    this.cancelTimer()
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
  }

  private dirty(): string[] {
    try {
      const ids: unknown = JSON.parse(this.storage.loadMeta('dirty') ?? '[]')
      return Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []
    } catch {
      return []
    }
  }

  private saveDirty(ids: string[]): void {
    this.storage.saveMeta('dirty', ids.length > 0 ? JSON.stringify(ids) : null)
  }
}
