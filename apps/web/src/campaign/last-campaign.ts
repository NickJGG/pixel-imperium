import { useEffect, useSyncExternalStore } from 'react'
import { useRouterState } from '@tanstack/react-router'
import type { Campaign, CampaignSummary } from '@pixel-imperium/protocol'
import { getAccount } from '../account.ts'
import { campaign as loadCampaign, campaigns as loadCampaigns } from '../content.ts'
import { seedStarted } from './started-campaigns.ts'

const KEY = 'pixel-imperium:last-campaign'

/** The campaign `/` and `/c` open: the last one played if it still exists, else the default (first). */
export function pickCampaign(campaigns: readonly CampaignSummary[]): string | null {
  let last: string | null = null
  try {
    last = localStorage.getItem(KEY)
  } catch {}
  return (campaigns.find(c => c.id === last) ?? campaigns[0])?.id ?? null
}

let current: Campaign | null = null
let summaries: readonly CampaignSummary[] | null = null
let fetching: Promise<void> | null = null
const listeners = new Set<() => void>()

/**
 * Records the campaign a page just loaded, so `/` reopens it and the chrome follows it, and counts it started if
 * there's progress in it.
 */
export function rememberCampaign(campaign: Campaign): void {
  try {
    localStorage.setItem(KEY, campaign.id)
  } catch {}
  current = campaign
  seedStarted(campaign, getAccount().storage)
  for (const listener of listeners) listener()
}

/** The campaign last shown, if any, without subscribing or fetching: for a skeleton's papers. */
export const currentCampaign = (): Campaign | null => current

/** Records the campaigns list a page just loaded, for a skeleton's spines. */
export function rememberCampaigns(list: readonly CampaignSummary[]): void {
  summaries = list
}

/** The campaigns list last loaded, if any. */
export const currentCampaigns = (): readonly CampaignSummary[] | null => summaries

async function fetchPicked(): Promise<void> {
  try {
    const id = pickCampaign(await loadCampaigns())
    const campaign = id === null ? null : await loadCampaign(id)
    if (campaign && !current) rememberCampaign(campaign)
  } catch {
    fetching = null
  }
}

/** The campaign last shown, fetching the picked one on pages that don't load a campaign. */
export function useCurrentCampaign(): Campaign | null {
  const campaign = useSyncExternalStore(
    listener => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
  // Waits for route loaders, which usually remember a campaign themselves.
  const idle = useRouterState({ select: s => s.status === 'idle' })
  useEffect(() => {
    if (idle && !current) fetching ??= fetchPicked()
  }, [idle])
  return campaign
}
