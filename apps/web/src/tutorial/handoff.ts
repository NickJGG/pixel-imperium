/**
 * Where a track hands back to. `back` is the page it was entered from: a puzzle returns there, Home
 * (or no `back`) goes on to the Continue target, a province page is named, and any other page, a Home
 * column included, is returned to as is. Learn's back pill names the same page.
 */
import type { Campaign } from '@pixel-imperium/protocol'
import { accountReady, getAccount } from '../account.ts'
import { campaign as fetchCampaign, campaigns as fetchCampaigns, puzzle as fetchPuzzle } from '../content.ts'
import { pickCampaign } from '../campaign/last-campaign.ts'
import { campaignProgress, continueAt } from '../campaign/progress.ts'

export interface Handoff {
  /** An internal path. */
  to: string
  heading: string
  text: string
  action: string
}

const BACK = /^\/(?:play\/[\w-]+|daily\/\d{4}\/\d{2}\/\d{2}|c\/[\w-]+(?:\/[\w-]+)?|\?open=(?:learn|profile|settings|signin))?$/

/** Only the app's own pages, so `back` can't send the player off the site. */
export const isBackPath = (back: unknown): back is string => typeof back === 'string' && BACK.test(back)

/** A back path as a link's `to` and `search`, since a Home column's lives in the query. */
export function backLink(back: string): { to: string; search: Record<string, string> } {
  const [to, query] = back.split('?')
  return { to: to!, search: Object.fromEntries(new URLSearchParams(query)) }
}

const DAILY = /^\/daily\/\d{4}\/\d{2}\/\d{2}$/

const DONE = "That's everything you need."

export async function loadHandoff(back: string | undefined): Promise<Handoff> {
  const puzzleId = back?.match(/^\/play\/(.+)$/)?.[1]
  const fallback: Handoff = { to: back ?? '/', heading: 'Back home.', text: DONE, action: 'Back home' }
  const page = back?.match(/^\/c\/([\w-]+)\/([\w-]+)$/)
  if (page) return provinceHandoff(page[1]!, page[2]!, fallback)
  if (back && DAILY.test(back)) {
    const text = `${DONE} Your puzzle is just as you left it.`
    return { to: back, heading: 'Back to the Daily.', text, action: 'Back to the Daily' }
  }
  if (back && back !== '/' && !puzzleId) return fallback
  try {
    await accountReady
    const campaign = puzzleId ? await campaignOf(puzzleId) : await homeCampaign()
    if (!campaign) return fallback
    const { storage } = getAccount()
    const next = continueAt(campaign, campaignProgress(campaign, storage), id => storage.loadSolved(id) !== null)
    const id = puzzleId ?? next?.puzzle.id
    const found = id === undefined ? null : findPuzzle(campaign, id)
    if (!found) return fallback
    const { province, number, title } = found
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

/** Learn's back pill, and the campaign whose progress says whether Techniques is recommended. */
export interface LearnBack {
  to: string
  label: string
  campaign: Campaign | null
}

export async function loadLearnBack(back: string | undefined): Promise<LearnBack> {
  const to = back ?? '/'
  const label = DAILY.test(to) ? 'Back to the Daily' : 'Back home'
  const puzzleId = to.match(/^\/play\/(.+)$/)?.[1]
  const page = to.match(/^\/c\/([\w-]+)(?:\/([\w-]+))?$/)
  try {
    await accountReady
    const campaign = puzzleId ? await campaignOf(puzzleId) : page ? await fetchCampaign(page[1]!) : await homeCampaign()
    const title = puzzleId && campaign ? findPuzzle(campaign, puzzleId)?.title : undefined
    const province = page?.[2] && campaign?.provinces.find(p => p.id === page[2])
    const name = title ?? (province ? province.name.replace(/^The /, 'the ') : undefined)
    return { to, label: name ? `Back to ${name}` : label, campaign }
  } catch {
    return { to, label, campaign: null }
  }
}

function findPuzzle(campaign: Campaign, id: string) {
  const province = campaign.provinces.find(p => p.puzzles.some(q => q.id === id))
  if (!province) return null
  const number = province.puzzles.findIndex(q => q.id === id) + 1
  return { province, number, title: province.puzzles[number - 1]!.title }
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
  return puzzle && 'campaignId' in puzzle ? fetchCampaign(puzzle.campaignId) : null
}

async function homeCampaign(): Promise<Campaign | null> {
  const id = pickCampaign(await fetchCampaigns())
  return id === null ? null : fetchCampaign(id)
}
