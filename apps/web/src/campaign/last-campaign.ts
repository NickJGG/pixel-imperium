import type { CampaignSummary } from '@pixel-imperium/protocol'

const KEY = 'pixel-imperium:last-campaign'

/** The campaign `/` opens: the last one played if it still exists, else the default (first). */
export function pickCampaign(campaigns: readonly CampaignSummary[]): string | null {
  let last: string | null = null
  try {
    last = localStorage.getItem(KEY)
  } catch {}
  return (campaigns.find(c => c.id === last) ?? campaigns[0])?.id ?? null
}

export function rememberCampaign(id: string): void {
  try {
    localStorage.setItem(KEY, id)
  } catch {}
}
