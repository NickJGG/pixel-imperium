import type { CoopAccess } from '@pixel-imperium/protocol'

export interface AccessFacts {
  room: 'live' | 'ended' | null
  /** Already holds a seat, so this is a reconnect. */
  seated: boolean
  removed: boolean
  /** Came by a link the Host has since replaced. */
  oldLink: boolean
  /** A seat is empty, or held by a guest who is gone. */
  seatFree: boolean
  /** The puzzle is Retired and this player never started it. */
  retiredClosed: boolean
}

/**
 * Removal is for good, even for a seat holder. Anyone seated may come back, by an old link too, so a New link never
 * strands a player who dropped while it changed; everyone else needs the current link, a free seat, and, on a Retired
 * puzzle, to have started it.
 */
export function decideAccess(facts: AccessFacts): CoopAccess | 'not-found' {
  if (facts.room === null) return 'not-found'
  if (facts.room === 'ended') return 'ended'
  if (facts.removed) return 'removed'
  if (facts.seated) return 'join'
  if (facts.oldLink) return 'ended'
  if (facts.retiredClosed) return 'retired-closed'
  return facts.seatFree ? 'join' : 'full'
}
