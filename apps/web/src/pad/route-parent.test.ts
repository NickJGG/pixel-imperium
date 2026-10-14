import { describe, expect, it } from 'vitest'
import { routeParent } from './route-parent.ts'

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
  ])('%s → %s', (path, parent) => {
    expect(routeParent(path)).toBe(parent)
  })
})
