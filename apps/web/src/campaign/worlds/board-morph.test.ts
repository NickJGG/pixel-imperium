import { describe, expect, it } from 'vitest'
import { RIPPLE_CAP_MS, RIPPLE_MS, boardSheet, rippleDelays } from './board-morph.ts'

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

describe('rippleDelays', () => {
  it('sets each slot off by its distance from the clicked one', () => {
    expect([...rippleDelays(ids(5), 'p3')]).toEqual([
      ['p1', 2 * RIPPLE_MS],
      ['p2', RIPPLE_MS],
      ['p3', 0],
      ['p4', RIPPLE_MS],
      ['p5', 2 * RIPPLE_MS],
    ])
  })

  it('closes the steps up so a big province stays within the cap', () => {
    const delays = rippleDelays(ids(30), 'p1')
    expect(delays.get('p1')).toBe(0)
    expect(delays.get('p30')).toBe(RIPPLE_CAP_MS)
    expect(delays.get('p2')).toBeLessThan(RIPPLE_MS)
  })

  it('has nothing to ripple when the clicked slot isn’t in the province', () => {
    expect(rippleDelays(ids(3), 'gone').size).toBe(0)
    expect([...rippleDelays(['p1'], 'p1')]).toEqual([['p1', 0]])
  })
})

describe('boardSheet', () => {
  const rule = (side: 'old' | 'new', name: string) => `:root::view-transition-${side}(slot-p1) {\n  animation-name: ${name}`

  it('grows the clicked slot into the board', () => {
    const sheet = boardSheet('p1', false)
    expect(sheet).toContain(rule('old', 'board-slot-out'))
    expect(sheet).toContain(rule('new', 'board-in'))
  })

  it('shrinks the board home on the way back, with keyframes of its own', () => {
    const sheet = boardSheet('p1', true)
    expect(sheet).toContain(rule('new', 'board-slot-in'))
    expect(sheet).toContain(rule('old', 'board-out'))
    expect(sheet).not.toContain('reverse')
  })

  it('never delays a pseudo-element', () => {
    expect(boardSheet('p1', false) + boardSheet('p1', true)).not.toContain('animation-delay')
  })
})
