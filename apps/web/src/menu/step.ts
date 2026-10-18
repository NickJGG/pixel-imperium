import { flushSync } from 'react-dom'
import { startStep } from '../campaign/worlds/morph-nav.ts'
import { type MenuColumn, columnBeside, getMenu, setColumn } from './menu-store.ts'
import './menu-step.css'

/**
 * Switches the open menu to `column`, morphing as Home's columns step. `menu-step` keeps the page's own names, under
 * the scrim, out of it (Menu.module.css), and quickens the old snapshots' fade (menu-step.css).
 */
export function goToColumn(column: MenuColumn): void {
  const { open, column: from } = getMenu()
  if (!open || column === from) return
  startStep(() => flushSync(() => setColumn(column)), ['menu-step'])
}

/** To the column before or after the open one, stopping at either end. */
export function stepMenu(dir: -1 | 1): void {
  const next = columnBeside(getMenu().column, dir)
  if (next) goToColumn(next)
}
