import { describe, expect, it } from 'vitest'
import { hintFor } from './hints.ts'
import { line } from './test-helpers.ts'

const palette = ['#000', null, null, '#000']

describe('hintFor', () => {
  it('points at a mistake before anything else', () => {
    expect(hintFor(palette, line('##..'))).toEqual({ kind: 'mistake', index: 1 })
    expect(hintFor(palette, line('x...'))).toEqual({ kind: 'mistake', index: 0 })
  })

  it('reveals a cell still to fill when there are no mistakes', () => {
    expect(hintFor(palette, line('#x..'))).toEqual({ kind: 'reveal', index: 3 })
  })

  it('picks among the candidates with `random`', () => {
    expect(hintFor(palette, line('....'), () => 0.99)).toEqual({ kind: 'reveal', index: 3 })
    expect(hintFor(palette, line('.##.'), () => 0.99)).toEqual({ kind: 'mistake', index: 2 })
  })

  it('is null on a solved grid, marks or not', () => {
    expect(hintFor(palette, line('#xx#'))).toBeNull()
    expect(hintFor(palette, line('#..#'))).toBeNull()
  })
})
