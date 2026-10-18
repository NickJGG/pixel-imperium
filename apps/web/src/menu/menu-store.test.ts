import { afterEach, describe, expect, it } from 'vitest'
import {
  closeMenu,
  columnBeside,
  getBoard,
  getMenu,
  openMenu,
  openMenuOn,
  setColumn,
  showBoard,
  subscribeMenu,
  takeLanding,
  toggleMenu,
} from './menu-store.ts'

const crown = { id: 'crown' } as unknown as HTMLElement

describe('menu store', () => {
  afterEach(closeMenu)

  it('starts closed', () => {
    expect(getMenu()).toEqual({ open: false, opener: null, column: 'menu' })
  })

  it('opens from a crown and remembers it', () => {
    openMenu(crown)
    expect(getMenu()).toEqual({ open: true, opener: crown, column: 'menu' })
  })

  it('opens without a crown, from a key', () => {
    openMenu()
    expect(getMenu()).toEqual({ open: true, opener: null, column: 'menu' })
  })

  it('opens on a column, which a crown reopens on Menu', () => {
    toggleMenu(crown, 'party')
    expect(getMenu()).toEqual({ open: true, opener: crown, column: 'party' })
    closeMenu()
    expect(getMenu().column).toBe('party')
    toggleMenu(crown)
    expect(getMenu().column).toBe('menu')
  })

  it('switches column while open, and only then', () => {
    openMenu(crown)
    setColumn('friends')
    expect(getMenu()).toEqual({ open: true, opener: crown, column: 'friends' })
    closeMenu()
    setColumn('party')
    expect(getMenu()).toEqual({ open: false, opener: crown, column: 'friends' })
  })

  it('finds the column beside one, none past either end', () => {
    expect(columnBeside('menu', 1)).toBe('friends')
    expect(columnBeside('party', -1)).toBe('friends')
    expect(columnBeside('menu', -1)).toBeUndefined()
    expect(columnBeside('party', 1)).toBeUndefined()
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

describe('opening on arrival', () => {
  it('opens on the column asked for at that page only, once', () => {
    openMenuOn('/', 'party')
    expect(takeLanding('/')).toBe('party')
    expect(takeLanding('/')).toBeNull()
  })

  it('drops the ask on arriving anywhere else', () => {
    openMenuOn('/', 'party')
    expect(takeLanding('/settings')).toBeNull()
    expect(takeLanding('/')).toBeNull()
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
