import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubStorage } from '../test-storage.ts'
import { markConquestsSeen, unseenConquests } from './conquests-seen.ts'

describe('conquests seen', () => {
  let data: Map<string, string>
  beforeEach(() => {
    data = stubStorage()
  })
  afterEach(() => vi.unstubAllGlobals())

  it('treats what a campaign has conquered on its first visit as already seen', () => {
    expect(unseenConquests('c1', ['a', 'b'])).toEqual([])
    expect(unseenConquests('c1', ['a', 'b', 'c'])).toEqual(['c'])
  })

  it('stops reporting a conquest once it is marked seen', () => {
    unseenConquests('c1', [])
    expect(unseenConquests('c1', ['a'])).toEqual(['a'])
    markConquestsSeen('c1', ['a'])
    expect(unseenConquests('c1', ['a'])).toEqual([])
  })

  it('keeps campaigns apart', () => {
    unseenConquests('c1', [])
    unseenConquests('c2', [])
    markConquestsSeen('c1', ['a'])
    expect(unseenConquests('c2', ['a'])).toEqual(['a'])
  })

  it('does not record a province twice', () => {
    markConquestsSeen('c1', ['a'])
    markConquestsSeen('c1', ['a', 'b'])
    expect(JSON.parse(data.get('pixel-imperium:conquests-seen')!)).toEqual({ c1: ['a', 'b'] })
  })

  it('starts over from a corrupt record', () => {
    data.set('pixel-imperium:conquests-seen', 'not json')
    expect(unseenConquests('c1', ['a'])).toEqual([])
    expect(unseenConquests('c1', ['a', 'b'])).toEqual(['b'])
  })
})
