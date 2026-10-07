import { describe, expect, it } from 'vitest'
import { edgeFade, mapFade, reachFrom } from './map-geometry.ts'

describe('edge fade', () => {
  const size = 30
  const edge = edgeFade(size, size, 11)

  it('fades in whole quarter steps', () => {
    expect(edge.filter(a => ![0, 0.25, 0.5, 0.75, 1].includes(a))).toEqual([])
  })

  it('leaves the middle solid', () => {
    for (let y = 10; y < size - 10; y++) for (let x = 10; x < size - 10; x++) expect(edge[y * size + x]).toBe(1)
  })

  it('fades the corners', () => {
    for (const i of [0, size - 1, size * (size - 1), size * size - 1]) expect(edge[i]).toBeLessThan(1)
  })

  it('is the same every time', () => {
    expect(edgeFade(size, size, 11)).toEqual(edge)
  })

  it('differs by seed', () => {
    expect(edgeFade(size, size, 18)).not.toEqual(edge)
  })
})

describe('crop window fade', () => {
  const [width, height, cols] = [60, 30, 40]
  const full = edgeFade(width, height, 11)
  const cropped = mapFade(width, height, cols, 11)
  const column = (x: number) => Array.from({ length: height }, (_, y) => cropped[y * width + x]!)

  it('hides everything outside the window', () => {
    for (const x of [0, 9, 50, 59]) expect(column(x)).toEqual(new Array(height).fill(0))
  })

  it('fades again at the window edges', () => {
    for (const x of [10, 49]) expect(Math.max(...column(x))).toBeLessThan(1)
  })

  it('never shows more than the full fade', () => {
    expect(cropped.every((a, i) => a <= full[i]!)).toBe(true)
  })

  it('leaves the middle solid', () => {
    expect(column(30).slice(10, 20)).toEqual(new Array(10).fill(1))
  })

  it('is the full fade when nothing is cropped', () => {
    expect(mapFade(width, height, width, 11)).toEqual(full)
  })
})

describe('reachFrom', () => {
  const reach = reachFrom(20, 10, { x: 5, y: 4 })

  it('starts at the landmark and ends at the farthest cell', () => {
    expect(reach[4 * 20 + 5]).toBe(0)
    expect(reach[9 * 20 + 19]).toBe(1)
  })

  it('grows with distance', () => {
    expect(reach[4 * 20 + 6]).toBeLessThan(reach[4 * 20 + 9]!)
    expect(reach[5 * 20 + 5]).toBeLessThan(reach[8 * 20 + 5]!)
  })
})
