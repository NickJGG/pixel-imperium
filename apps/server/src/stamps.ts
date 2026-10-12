import type { ProfileStamp, StampId } from '@pixel-imperium/protocol'

export interface StampSolve {
  puzzleId: string
  foil: boolean
  solvedAt: Date
}

export const FOIL_RUN = 5
export const SPREE = 10
const DAY_MS = 24 * 60 * 60 * 1000

/** A Campaign, or a Year whose pages are its Months, `01`–`12`. */
export interface StampAlbum {
  provinces: readonly { id: string; puzzles: readonly { id: string }[] }[]
}

/**
 * The Stamps a player has earned in `album`, each dated by the solve that earned it. `solves` must be the
 * player's verified solves only; ones of puzzles outside the album are ignored. A Year has no spree, completes
 * each Month on its own and needs every Month with Dailies for `year-complete`.
 */
export function stampsFor(album: StampAlbum, solves: readonly StampSolve[], { year = false } = {}): ProfileStamp[] {
  const inAlbum = new Set(album.provinces.flatMap(p => p.puzzles.map(q => q.id)))
  const ordered = solves
    .filter(s => inAlbum.has(s.puzzleId))
    .toSorted((a, b) => a.solvedAt.getTime() - b.solvedAt.getTime())
  const byPuzzle = new Map(ordered.map(s => [s.puzzleId, s]))
  const earned = new Map<StampId, Date>()
  const earn = (id: StampId, at: Date | undefined) => {
    if (at && !earned.has(id)) earned.set(id, at)
  }

  earn('first-sticker', ordered[0]?.solvedAt)
  const foils = ordered.filter(s => s.foil)
  earn('first-foil', foils[0]?.solvedAt)

  let run = 0
  for (const s of ordered) {
    run = s.foil ? run + 1 : 0
    if (run === FOIL_RUN) earn('foil-run', s.solvedAt)
  }

  for (let i = SPREE - 1; !year && i < ordered.length; i++) {
    const last = ordered[i]!.solvedAt
    if (last.getTime() - ordered[i - SPREE + 1]!.solvedAt.getTime() <= DAY_MS) earn('spree', last)
  }

  const completed = album.provinces.flatMap((province, i) => {
    const pageSolves = province.puzzles.map(q => byPuzzle.get(q.id))
    if (pageSolves.length === 0 || !pageSolves.every(s => s !== undefined)) return []
    const at = new Date(Math.max(...pageSolves.map(s => s.solvedAt.getTime())))
    const last = i === album.provinces.length - 1
    const id: StampId = year ? `month-complete:${province.id}` : last ? 'album-complete' : `conquered:${province.id}`
    return [{ id, at, perfect: pageSolves.every(s => s.foil) }]
  })
  earn('perfect-page', completed.filter(c => c.perfect).toSorted((a, b) => a.at.getTime() - b.at.getTime())[0]?.at)
  for (const { id, at } of completed) earn(id, at)
  const pages = album.provinces.filter(p => p.puzzles.length > 0).length
  if (year && pages > 0 && completed.length === pages) {
    earn('year-complete', new Date(Math.max(...completed.map(c => c.at.getTime()))))
  }

  return [...earned].map(([id, at]) => ({ id, earnedAt: at.toISOString() }))
}
