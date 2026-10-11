/**
 * Which Conquests the province page has already unveiled, per campaign on this device, so the unveil plays once.
 * A campaign it has never recorded starts from what's conquered now, so a save from before the unveil existed doesn't
 * replay every province it has already won.
 */
const KEY = 'pixel-imperium:conquests-seen'

type Seen = Record<string, string[]>

function load(): Seen {
  try {
    const seen: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return seen && typeof seen === 'object' && !Array.isArray(seen) ? (seen as Seen) : {}
  } catch {
    return {}
  }
}

function save(seen: Seen): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(seen))
  } catch {}
}

/** The `conquered` province ids the province page hasn't unveiled yet. */
export function unseenConquests(campaignId: string, conquered: readonly string[]): string[] {
  const seen = load()
  const ids = seen[campaignId]
  if (!Array.isArray(ids)) {
    save({ ...seen, [campaignId]: [...conquered] })
    return []
  }
  return conquered.filter(id => !ids.includes(id))
}

export function markConquestsSeen(campaignId: string, provinceIds: readonly string[]): void {
  const seen = load()
  const ids = seen[campaignId] ?? []
  save({ ...seen, [campaignId]: [...ids, ...provinceIds.filter(id => !ids.includes(id))] })
}
