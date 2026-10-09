import { describe, expect, it } from 'vitest'
import { routeParent } from './route-parent.ts'

describe('routeParent', () => {
  it.each([
    ['/c/rome/latium', '/c/rome'],
    ['/c/rome', null],
    ['/', null],
    ['/learn/techniques/overlap', '/learn'],
    ['/u/ann/rome/latium', '/u/ann'],
    ['/learn', '/'],
    ['/settings', '/'],
    ['/u/ann', '/'],
    ['/play/abc', null],
  ])('%s → %s', (path, parent) => {
    expect(routeParent(path)).toBe(parent)
  })
})
