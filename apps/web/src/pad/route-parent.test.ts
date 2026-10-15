import { describe, expect, it } from 'vitest'
import { parentOf, routeParent } from './route-parent.ts'

describe('routeParent', () => {
  it.each([
    ['/c/rome/latium', '/c/rome'],
    ['/c/rome', '/'],
    ['/daily/2026/10', '/?open=daily'],
    ['/daily/2026/10/12', null],
    ['/', null],
    ['/learn/techniques/overlap', '/learn/techniques'],
    ['/learn/tutorial', '/?open=learn'],
    ['/u/ann/rome/latium', '/u/ann'],
    ['/learn', '/?open=learn'],
    ['/settings', '/?open=settings'],
    ['/u/ann', '/?open=profile'],
    ['/play/abc', null],
    ['/workshop', '/?open=workshop'],
    ['/workshop/puzzles', '/workshop'],
    ['/workshop/p/abc', '/workshop'],
    ['/workshop/c/d-1/crest', '/workshop?open=d-1'],
    ['/workshop/c/d-1/2', '/workshop?open=d-1'],
    ['/workshop/c/d-1/playtest/2', '/workshop?open=d-1'],
    ['/workshop/c/d-1/playtest/2/3', '/workshop/c/d-1/playtest/2'],
  ])('%s → %s', (path, parent) => {
    expect(routeParent(path)).toBe(parent)
  })
})

describe('parentOf', () => {
  it("takes the page's parent over the path's", () => {
    expect(parentOf('/play/abc', '/c/rome/latium')).toBe('/c/rome/latium')
    expect(parentOf('/c/rome/latium', '/c/elsewhere')).toBe('/c/elsewhere')
  })

  it("falls back to the path's", () => {
    expect(parentOf('/c/rome/latium', undefined)).toBe('/c/rome')
    expect(parentOf('/play/abc', undefined)).toBeNull()
  })
})
