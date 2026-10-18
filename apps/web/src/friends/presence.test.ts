import { describe, expect, it } from 'vitest'
import type { Friend } from '@pixel-imperium/protocol'
import { withPresence } from './presence.ts'

const friend = (handle: string, online = false, party: number | null = null): Friend => ({
  handle,
  name: handle,
  image: null,
  online,
  party,
})

describe('withPresence', () => {
  it("takes the socket's presence over the list's, matching Handles in any case", () => {
    const list = [friend('ada', true), friend('Juno')]
    expect(withPresence(list, [{ handle: 'juno', online: true, party: 2 }, { handle: 'ada', online: false, party: null }])).toEqual([
      friend('Juno', true, 2),
      friend('ada'),
    ])
  })

  it('keeps the list as it is for friends the socket has not mentioned, online first then by Handle', () => {
    const list = [friend('theo'), friend('Ivo', true), friend('ada')]
    expect(withPresence(list, []).map(f => f.handle)).toEqual(['Ivo', 'ada', 'theo'])
  })
})
