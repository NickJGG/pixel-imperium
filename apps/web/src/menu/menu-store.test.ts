import { afterEach, describe, expect, it } from 'vitest'
import { closeMenu, getBoard, getMenu, openMenu, showBoard, subscribeMenu, toggleMenu } from './menu-store.ts'

const crown = { id: 'crown' } as unknown as HTMLElement

describe('menu store', () => {
  afterEach(closeMenu)

  it('starts closed', () => {
    expect(getMenu()).toEqual({ open: false, opener: null })
  })

  it('opens from a crown and remembers it', () => {
    openMenu(crown)
    expect(getMenu()).toEqual({ open: true, opener: crown })
  })

  it('opens without a crown, from a key', () => {
    openMenu()
    expect(getMenu()).toEqual({ open: true, opener: null })
  })

  it('toggles', () => {
    toggleMenu(crown)
    expect(getMenu().open).toBe(true)
    toggleMenu()
    expect(getMenu().open).toBe(false)
  })

  it('tells listeners only when it changes', () => {
    let calls = 0
    const stop = subscribeMenu(() => calls++)
    openMenu(crown)
    openMenu(crown)
    closeMenu()
    closeMenu()
    stop()
    openMenu()
    expect(calls).toBe(2)
  })
})

describe('board on the page', () => {
  it('is marked while shown and unmarked after', () => {
    const hide = showBoard('a')
    expect(getBoard()).toBe('a')
    hide()
    expect(getBoard()).toBeNull()
  })

  it("keeps the next board when the last one's unmarking runs after it", () => {
    const hideA = showBoard('a')
    const hideB = showBoard('b')
    hideA()
    expect(getBoard()).toBe('b')
    hideB()
  })
})
