/**
 * Dev only: `/c/:id/map?conquer=<provinceId>` plays that province's conquest as if every province up
 * to it were just filled, without touching saved progress, so it replays on every reload.
 */
import type { Campaign } from '@pixel-imperium/protocol'
import { type CampaignProgress, provinceStates } from './progress.ts'
import type { CrestArt } from './stickers.ts'

const PLACEHOLDER = ['#ffd34a', '#5bc8ff', '#5ec46f', '#ff9a3d', '#b48cff', '#ff4fa3']

export interface ConquestPreview {
  progress: CampaignProgress
  conquests: number[]
  from: CampaignProgress[]
  crests: (CrestArt | null)[]
}

export function previewConquest(
  campaign: Pick<Campaign, 'provinces'>,
  provinceId: string,
  crests: readonly (CrestArt | null)[],
): ConquestPreview | null {
  const index = campaign.provinces.findIndex(p => p.id === provinceId)
  if (index === -1) return null
  const upTo = (n: number) => {
    const solved = new Set(campaign.provinces.slice(0, n).flatMap(p => p.puzzles.map(q => q.id)))
    return provinceStates(campaign, id => solved.has(id))
  }
  return {
    progress: upTo(index + 1),
    conquests: [index],
    from: [upTo(index)],
    // Real Crest art needs a verified solve; a checkerboard in the province's tab colour stands in.
    crests: campaign.provinces.map((p, i) => {
      if (crests[i] || i > index) return crests[i] ?? null
      const last = p.puzzles.at(-1)
      if (!last) return null
      const colour = PLACEHOLDER[i % PLACEHOLDER.length]!
      const palette = Array.from({ length: last.width * last.height }, (_, k) =>
        (Math.floor(k / last.width) + (k % last.width)) % 2 === 0 ? colour : '#f6f7ff',
      )
      return { title: last.title, width: last.width, height: last.height, palette }
    }),
  }
}
