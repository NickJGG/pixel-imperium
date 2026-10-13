import { describe, expect, it } from 'vitest'
import { padControls } from './controls.ts'

const play = { lines: true, zoom: true, back: 'Back to page' }
const actions = (...args: Parameters<typeof padControls>) => padControls(...args).map(([, action]) => action)

describe('padControls', () => {
  it('lists the board in full on /play', () => {
    expect(actions('board', play)).toEqual([
      'Move',
      'Fill',
      'Cross',
      'Straight lines',
      'Undo / redo',
      'Zoom',
      'Panel',
      'Menu',
    ])
  })

  it('drops Straight lines on fixed assists and zoom where the board cannot zoom', () => {
    const board = actions('board', { lines: false, zoom: false, back: 'All lessons' })
    expect(board).not.toContain('Straight lines')
    expect(board).not.toContain('Zoom')
  })

  it('closes a scope, backs out once solved, and returns to the board from the page', () => {
    expect(padControls('scope', play).at(-1)).toEqual([['B'], 'Close'])
    expect(padControls('solved', play).at(-1)).toEqual([['B'], 'Back to page'])
    expect(padControls('page', play)).toContainEqual([['B', 'View'], 'Back to the board'])
  })
})
