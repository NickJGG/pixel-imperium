import type { CSSProperties } from 'react'

/** The six paper colours in tokens.css, dealt to provinces in order. */
const PAPERS = ['marches', 'coast', 'wildwood', 'forge', 'capital', 'throne']

/** Sets `--paper` and `--tab` to the province's colours, for its pages, tabs and seals. */
export function paperStyle(index: number): CSSProperties {
  const name = PAPERS[index % PAPERS.length]
  return { '--paper': `var(--p-${name})`, '--tab': `var(--t-${name})` } as CSSProperties
}
