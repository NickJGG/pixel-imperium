/**
 * The Campaigns row: every campaign as a spine in one order, and on a desktop the window of it that shows.
 * Dates are `YYYY-MM-DD`, compared as strings.
 */
import type { CampaignSummary } from '@pixel-imperium/protocol'

/** How long a release stays Featured, counting its release day as day 0. */
export const FEATURED_DAYS = 30

/** The last day `released` is Featured. */
export function featuredUntil(released: string): string {
  const [y, m, d] = released.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(y, m - 1, d + FEATURED_DAYS)).toISOString().slice(0, 10)
}

export const isFeatured = (c: Pick<CampaignSummary, 'released'>, today: string): boolean =>
  c.released !== undefined && c.released <= today && today <= featuredUntil(c.released)

/**
 * The player's started campaigns, then Featured ones they haven't started, then the rest, each group by release
 * date (a draft without one last), ties in `summaries`' own order.
 */
export function rowOrder<C extends Pick<CampaignSummary, 'id' | 'released'>>(
  summaries: readonly C[],
  started: ReadonlySet<string>,
  today: string,
): C[] {
  const group = (c: C) => (started.has(c.id) ? 0 : isFeatured(c, today) ? 1 : 2)
  const released = (c: C) => c.released ?? '9999-12-31'
  return summaries
    .map((c, i) => ({ c, i }))
    .sort((a, b) => group(a.c) - group(b.c) || released(a.c).localeCompare(released(b.c)) || a.i - b.i)
    .map(({ c }) => c)
}

/** How many columns a desktop shows of the row: the open one and three either side. */
export const WINDOW = 7

/** The slice `[lo, hi)` of `count` columns that shows around `at`: centred on it, pinned at the ends. */
export function windowOf(count: number, at: number, size = WINDOW): { lo: number; hi: number } {
  const lo = Math.max(0, Math.min(at - Math.floor(size / 2), count - size))
  return { lo, hi: Math.min(count, lo + size) }
}

/** Where a stub's click lands: a whole window along, clamped to the row. */
export const jump = (at: number, dir: -1 | 1, count: number, size = WINDOW): number =>
  Math.max(0, Math.min(count - 1, at + dir * size))
