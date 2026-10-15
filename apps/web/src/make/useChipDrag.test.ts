import { describe, expect, it } from 'vitest'
import { dropIndex } from './useChipDrag.ts'

describe('dropIndex', () => {
  const mids = [100, 170, 240]

  it('lands above the first chip whose midpoint is below the centre', () => {
    expect(dropIndex(50, mids)).toBe(0)
    expect(dropIndex(120, mids)).toBe(1)
    expect(dropIndex(239, mids)).toBe(2)
  })

  it('lands last past every midpoint, counting a centre on one as past it', () => {
    expect(dropIndex(240, mids)).toBe(3)
    expect(dropIndex(900, mids)).toBe(3)
  })

  it('has one spot with no other chips', () => {
    expect(dropIndex(10, [])).toBe(0)
  })
})
