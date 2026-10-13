import type { PadOwner } from './owner.ts'
import type { GlyphButton } from './PadGlyph.tsx'

export interface BoardControls {
  /** Y toggles Straight lines; not on a Lesson's fixed assists. */
  lines: boolean
  zoom: boolean
  /** Where B goes once solved. */
  back: string
}

export type Control = readonly [buttons: readonly GlyphButton[], action: string]

/** What each button does for `owner`; a solved board counts as the page. */
export function padControls(owner: PadOwner | 'solved', { lines, zoom, back }: BoardControls): Control[] {
  const move: Control = [['Move'], 'Move']
  const select: Control = [['A'], 'Select']
  const menu: Control = [['Menu'], 'Menu']
  if (owner === 'scope') return [move, select, [['B'], 'Close']]
  if (owner === 'solved') return [move, select, [['B'], back]]
  if (owner === 'page') return [move, select, [['B', 'View'], 'Back to the board'], menu]
  return [
    move,
    [['A'], 'Fill'],
    [['X'], 'Cross'],
    ...(lines ? [[['Y'], 'Straight lines'] as const] : []),
    [['LB', 'RB'], 'Undo / redo'],
    ...(zoom ? [[['LT', 'RT'], 'Zoom'] as const] : []),
    [['View'], 'Panel'],
    menu,
  ]
}
