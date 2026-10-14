import type { CSSProperties } from 'react'
import type { PaperId } from '@pixel-imperium/protocol'

export type { PaperId }

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

/** Sets `--paper` and `--tab` to a named paper's colours, for its pages, tabs and seals. */
export const paperFor = (name: PaperId): CSSProperties =>
  ({ '--paper': `var(--p-${name})`, '--tab': `var(--t-${name})` }) as CSSProperties

/** `month` is 1–12. */
export function seasonOf(month: number): Season {
  return month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn'
}

/** `paperFor` for a Month of Dailies: its season's paper and tab. */
export const seasonStyle = (month: number) => paperFor(seasonOf(month))
