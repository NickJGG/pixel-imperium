import { describe, expect, it } from 'vitest'
import {
  type Box,
  LIFT_AT,
  RIPPLE_CAP_MS,
  RIPPLE_MS,
  boardSheet,
  centredOn,
  doorBackKeyframes,
  doorKeyframes,
  drivenSheet,
  fileKeyframes,
  liftKeyframes,
  rippleDelays,
} from './board-morph.ts'

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

const board: Box = { x: 300, y: 100, w: 600, h: 400 }
const slot: Box = { x: 40, y: 220, w: 64, h: 64 }

const boxAt = (frames: Keyframe[], offset: number) => {
  const frame = frames.find(f => f.offset === offset)!
  const [x, y] = /translate\((.+)px, (.+)px\)/.exec(String(frame.transform))!.slice(1).map(Number)
  return { x, y, w: parseFloat(String(frame.width)), h: parseFloat(String(frame.height)) }
}

const ascending = (frames: Keyframe[]) =>
  frames.every((f, i) => i === 0 || (f.offset as number) > (frames[i - 1]!.offset as number))

describe('centredOn', () => {
  it('puts a box of one size where another’s middle is', () => {
    expect(centredOn(board, slot)).toEqual({ x: 568, y: 268, w: 64, h: 64 })
  })
})

describe('fileKeyframes', () => {
  const frames = fileKeyframes(board, slot)

  it('shrinks the board in place to its slot’s size before flying it home', () => {
    expect(boxAt(frames.group, 0)).toEqual(board)
    expect(boxAt(frames.group, 0.25)).toEqual(centredOn(board, slot))
    expect(boxAt(frames.group, 0.55)).toEqual(slot)
    expect(boxAt(frames.group, 1)).toEqual(slot)
  })

  it('is a sticker before it flies, peels in flight and squashes as it lands', () => {
    expect(frames.new.find(f => f.offset === 0.25)!.opacity).toBe(1)
    expect(frames.pair.find(f => f.offset === 0.4)!.transform).toContain('rotate(-7deg)')
    expect(frames.pair.some(f => String(f.transform).startsWith('scale(0.86)'))).toBe(true)
  })

  it('keeps every track’s offsets in order', () => {
    for (const track of Object.values(frames)) expect(ascending(track)).toBe(true)
  })
})

describe('liftKeyframes', () => {
  const frames = liftKeyframes(slot, board)

  it('waits in the strip, flies to the middle at its own size, then opens into the board', () => {
    expect(boxAt(frames.group, LIFT_AT)).toEqual(slot)
    expect(boxAt(frames.group, frames.group[2]!.offset as number)).toEqual(centredOn(board, slot))
    expect(boxAt(frames.group, 1)).toEqual(board)
  })

  it('lifts while the last board is still flying, and shows the clues only once it has grown', () => {
    expect(LIFT_AT).toBeLessThan(0.55)
    const shown = frames.new.find(f => f.opacity === 1)!.offset as number
    expect(shown).toBeGreaterThan(frames.group[3]!.offset as number)
  })

  it('keeps every track’s offsets in order and within the transition', () => {
    for (const track of Object.values(frames)) {
      expect(ascending(track)).toBe(true)
      expect(track.at(-1)!.offset).toBe(1)
    }
  })
})

describe('drivenSheet', () => {
  it('leaves the named board’s pseudo-elements to script', () => {
    const sheet = drivenSheet('slot-p1', 4)
    for (const part of ['group', 'image-pair', 'old', 'new'])
      expect(sheet).toMatch(new RegExp(`::view-transition-${part}\\(slot-p1\\)[^}]*animation: none !important`))
  })
})

describe('doorKeyframes', () => {
  for (const phone of [false, true])
    describe(phone ? 'on a phone' : 'on a desktop', () => {
      const frames = doorKeyframes(slot, board, phone)
      const fly = frames.group[1]!.offset as number

      it('flies the slot to the board’s middle at its own size, settles, then opens into the board', () => {
        expect(boxAt(frames.group, 0)).toEqual(slot)
        expect(boxAt(frames.group, fly)).toEqual(centredOn(board, slot))
        expect(boxAt(frames.group, frames.group[2]!.offset as number)).toEqual(centredOn(board, slot))
        expect(boxAt(frames.group, 1)).toEqual(board)
      })

      it('peels in flight and lands flat, and shows the clues only once it has started to grow', () => {
        expect(frames.pair.find(f => f.offset === fly / 2)!.transform).toContain('rotate(-7deg)')
        expect(frames.pair.find(f => f.offset === fly)!.transform).toBe('scale(1) rotate(0deg)')
        const shown = frames.new.find(f => f.opacity === 1)!.offset as number
        expect(shown).toBeGreaterThan(frames.group[2]!.offset as number)
      })

      it('keeps every track’s offsets in order and within the transition', () => {
        for (const track of Object.values(frames)) {
          expect(ascending(track)).toBe(true)
          expect(track.at(-1)!.offset).toBe(1)
        }
      })
    })

  it('flies a phone’s slot sooner', () => {
    expect(doorKeyframes(slot, board, true).group[1]!.offset).toBeLessThan(
      doorKeyframes(slot, board, false).group[1]!.offset as number,
    )
  })
})

describe('doorBackKeyframes', () => {
  it('is the way in with the board as the old side, for playing backwards', () => {
    const into = doorKeyframes(slot, board, false)
    const back = doorBackKeyframes(slot, board, false)
    expect(back.group).toEqual(into.group)
    expect(back.old).toEqual(into.new)
    expect(back.new).toEqual(into.old)
    expect(back.old.at(-1)!.opacity).toBe(1)
  })
})
