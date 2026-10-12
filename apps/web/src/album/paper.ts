import type { CSSProperties } from 'react'

/** The six paper colours in tokens.css, dealt to provinces in order. */
const PAPERS = ['marches', 'coast', 'wildwood', 'forge', 'capital', 'throne']

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

const named = (name: string) => ({ '--paper': `var(--p-${name})`, '--tab': `var(--t-${name})` }) as CSSProperties

/** Sets `--paper` and `--tab` to the province's colours, for its pages, tabs and seals. */
export function paperStyle(index: number): CSSProperties {
  return named(PAPERS[index % PAPERS.length]!)
}

/** `month` is 1–12. */
export function seasonOf(month: number): Season {
  return month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn'
}

/** `paperStyle` for a Month of Dailies: its season's paper and tab. */
export const seasonStyle = (month: number) => named(seasonOf(month))
