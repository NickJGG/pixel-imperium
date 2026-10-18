import type { Friend, FriendPresence } from '@pixel-imperium/protocol'

/** The friends' presence as the socket last told it, over the list's; online first, then by Handle. */
export function withPresence(friends: readonly Friend[], presence: readonly FriendPresence[]): Friend[] {
  const live = new Map(presence.map(p => [p.handle.toLowerCase(), p]))
  return friends
    .map(f => {
      const p = live.get(f.handle.toLowerCase())
      return p ? { ...f, online: p.online, party: p.party } : f
    })
    .sort((a, b) => Number(b.online) - Number(a.online) || a.handle.toLowerCase().localeCompare(b.handle.toLowerCase()))
}
