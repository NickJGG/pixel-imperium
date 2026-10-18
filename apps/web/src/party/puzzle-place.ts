import { useEffect, useState } from 'react'
import type { PuzzleSummary } from '@pixel-imperium/protocol'
import { campaign, puzzle } from '../content.ts'

/** Where the Party's puzzle sits, for its card: its slot number and "Imperium · Coast", or its Author's. */
export interface PuzzlePlace {
  puzzle: PuzzleSummary
  /** 1-based, on its Province's pages; absent outside a Campaign. */
  number?: number
  where: string
}

async function placeOf(id: string): Promise<PuzzlePlace | null> {
  const clues = await puzzle(id)
  if (!clues) return null
  const made = 'made' in clues ? clues.made : null
  const at = 'campaignId' in clues ? { id: clues.campaignId, provinceId: clues.provinceId } : made?.campaign
  const found = at && (await campaign(at.id).catch(() => null))
  const province = at && found?.provinces.find(p => p.id === at.provinceId)
  const number = province ? province.puzzles.findIndex(p => p.id === id) + 1 : 0
  if (found && province && number > 0) return { puzzle: clues, number, where: `${found.name} · ${province.name}` }
  return { puzzle: clues, where: made ? `By @${made.author}` : '' }
}

export function usePuzzlePlace(id: string | null): PuzzlePlace | null {
  const [place, setPlace] = useState<PuzzlePlace | null>(null)
  useEffect(() => {
    if (!id) return setPlace(null)
    let live = true
    placeOf(id).then(
      p => live && setPlace(p),
      () => live && setPlace(null),
    )
    return () => {
      live = false
    }
  }, [id])
  return place?.puzzle.id === id ? place : null
}
