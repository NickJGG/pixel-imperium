/**
 * Where a track hands back to. `back` is the page it was entered from: a puzzle returns there, home
 * (or no `back`) goes on to the Continue target, a province page is named, and any other album page is
 * returned to as is.
 */
import type { Campaign } from '@pixel-imperium/protocol'
import { accountReady, getAccount } from '../account.ts'
import { fetchCampaign, fetchCampaigns, fetchPuzzle } from '../api.ts'
import { pickCampaign } from '../campaign/last-campaign.ts'
import { campaignProgress, continueAt } from '../campaign/progress.ts'

export interface Handoff {
  /** An internal path. */
  to: string
  heading: string
  text: string
  action: string
}

const BACK = /^\/(?:play\/[\w-]+|c\/[\w-]+(?:\/[\w-]+)?)?$/

/** Only the app's own pages, so `back` can't send the player off the site. */
export const isBackPath = (back: unknown): back is string => typeof back === 'string' && BACK.test(back)

const DONE = "That's everything you need."

export async function loadHandoff(back: string | undefined): Promise<Handoff> {
  const puzzleId = back?.match(/^\/play\/(.+)$/)?.[1]
  const fallback: Handoff =
    back && back !== '/'
      ? { to: back, heading: 'Back to the album.', text: DONE, action: 'Back to the album' }
      : { to: '/', heading: 'Back to the cover.', text: DONE, action: 'Back to the cover' }
  const page = back?.match(/^\/c\/([\w-]+)\/([\w-]+)$/)
  if (page) return provinceHandoff(page[1]!, page[2]!, fallback)
  if (back && back !== '/' && !puzzleId) return fallback
  try {
    await accountReady
    const campaign = puzzleId ? await campaignOf(puzzleId) : await homeCampaign()
    if (!campaign) return fallback
    const { storage } = getAccount()
    const next = continueAt(campaign, campaignProgress(campaign, storage), id => storage.loadSolved(id) !== null)
    const id = puzzleId ?? next?.puzzle.id
    const province = campaign.provinces.find(p => p.puzzles.some(q => q.id === id))
    if (!province) return fallback
    const number = province.puzzles.findIndex(q => q.id === id) + 1
    const { title } = province.puzzles[number - 1]!
    if (next?.fresh && next.puzzle.id === id) {
      return {
        to: `/play/${id}`,
        heading: `Your album starts in ${province.name.replace(/^The /, 'the ')}.`,
        text: `${DONE} Every puzzle from here is a picture waiting in your album, starting small.`,
        action: `Start: #${number} ${title}`,
      }
    }
    return {
      to: `/play/${id}`,
      heading: `Back to ${title}.`,
      text: `${DONE} Your puzzle is just as you left it.`,
      action: `${puzzleId ? 'Back to' : 'Continue:'} #${number} ${title}`,
    }
  } catch {
    return fallback
  }
}

async function provinceHandoff(campaignId: string, provinceId: string, fallback: Handoff): Promise<Handoff> {
  try {
    const province = (await fetchCampaign(campaignId))?.provinces.find(p => p.id === provinceId)
    if (!province) return fallback
    const name = province.name.replace(/^The /, 'the ')
    return { ...fallback, heading: `On to ${name}.`, action: `Open ${name}` }
  } catch {
    return fallback
  }
}

async function campaignOf(puzzleId: string): Promise<Campaign | null> {
  const puzzle = await fetchPuzzle(puzzleId)
  return puzzle && fetchCampaign(puzzle.campaignId)
}

async function homeCampaign(): Promise<Campaign | null> {
  const id = pickCampaign(await fetchCampaigns())
  return id === null ? null : fetchCampaign(id)
}
