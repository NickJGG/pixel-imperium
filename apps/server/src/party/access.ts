import type { PartyAccess } from '@pixel-imperium/protocol'

export interface AccessFacts {
  party: 'live' | 'ended' | null
  /** Already holds a seat, so this is a reconnect. */
  seated: boolean
  removed: boolean
  /** Came by a friend's invite rather than a link. */
  invited: boolean
  /** Came by a link the Host has since replaced. */
  oldLink: boolean
  /** A seat is empty, or held by a member who is gone. */
  seatFree: boolean
  /** The Party is on a Retired puzzle this player never started. */
  retiredClosed: boolean
}

/**
 * Removal is for good, even for a seat holder or by a friend's invite. Anyone seated may come back, by an old link
 * too, so a New link never strands a player who dropped while it changed; an invite needs no link at all; everyone
 * else needs the current link. Newcomers need a free seat and, on a Retired puzzle, to have started it.
 */
export function decideAccess(facts: AccessFacts): PartyAccess | 'not-found' {
  if (facts.party === null) return 'not-found'
  if (facts.party === 'ended') return 'ended'
  if (facts.removed) return 'removed'
  if (facts.seated) return 'join'
  if (facts.oldLink && !facts.invited) return 'ended'
  if (facts.retiredClosed) return 'retired-closed'
  return facts.seatFree ? 'join' : 'full'
}
