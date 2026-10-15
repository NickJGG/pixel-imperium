import { describe, expect, it } from 'vitest'
import { stepName } from './Trail.tsx'

describe('stepName', () => {
  it('names Home', () => {
    expect(stepName('/')).toBe('trail-home')
  })

  it('slugs a path into one ident', () => {
    expect(stepName('/c/imperium')).toBe('trail-c-imperium')
    expect(stepName('/c/imperium/')).toBe('trail-c-imperium')
    expect(stepName('/learn/basics?x=1')).toBe('trail-learn-basics-x-1')
  })
})
