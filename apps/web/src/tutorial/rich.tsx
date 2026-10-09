import type { ReactNode } from 'react'

/** Renders the beats' `**bold**`, `_italic_` and `` `key` `` spans. */
export function rich(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`)/).map((part, i) => {
    if (i % 2 === 0) return part
    if (part.startsWith('**')) return <b key={i}>{part.slice(2, -2)}</b>
    if (part.startsWith('`')) return <kbd key={i}>{part.slice(1, -1)}</kbd>
    return <i key={i}>{part.slice(1, -1)}</i>
  })
}
