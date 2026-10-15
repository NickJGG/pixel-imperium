import type { CSSProperties } from 'react'
import type { Paper, PaperId } from '@pixel-imperium/protocol'

export type { Paper, PaperId }

export type Season = 'winter' | 'spring' | 'summer' | 'autumn'

/** A hex paper's colors: the page in Night and in Day, and the tab, which is the same in both. */
export interface DerivedPaper {
  night: string
  day: string
  tab: string
}

/** Below this chroma (0–1) a pick has no hue worth keeping and its paper is grey. */
const NEUTRAL = 0.1
const GREY: DerivedPaper = { night: '#2b2b2d', day: '#ebebeb', tab: '#a8a8a8' }

/**
 * A player's pick as a paper the way the named ones are paired (Marches: tab #ffd34a, Night #3a3214, Day #ffeaa8):
 * its hue on a dark muted Night page and a pale Day one, with a vivid tab, so text in either theme's ink reads.
 */
export function derivePaper(hex: string): DerivedPaper {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255) as [number, number, number]
  const max = Math.max(r, g, b)
  const chroma = max - Math.min(r, g, b)
  if (chroma < NEUTRAL) return GREY
  const sector = max === r ? ((g - b) / chroma + 6) % 6 : max === g ? (b - r) / chroma + 2 : (r - g) / chroma + 4
  const hue = sector * 60
  return { night: hslHex(hue, 0.5, 0.15), day: hslHex(hue, 0.9, 0.87), tab: hslHex(hue, 0.9, 0.66) }
}

function hslHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const channel = (k: number) => {
    const at = (k + h / 30) % 12
    const v = l - a * Math.max(-1, Math.min(at - 3, 9 - at, 1))
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

/**
 * Sets `--paper` and `--tab` to a paper's colors, for its pages, tabs and seals. A hex paper switches theme without
 * JS: `--day` is 0 in Night and 1 in Day (tokens.css).
 */
export function paperFor(paper: Paper): CSSProperties {
  if (!paper.startsWith('#')) return { '--paper': `var(--p-${paper})`, '--tab': `var(--t-${paper})` } as CSSProperties
  const { night, day, tab } = derivePaper(paper)
  return { '--paper': `color-mix(in srgb, ${day} calc(var(--day) * 100%), ${night})`, '--tab': tab } as CSSProperties
}

/** `month` is 1–12. */
export function seasonOf(month: number): Season {
  return month === 12 || month <= 2 ? 'winter' : month <= 5 ? 'spring' : month <= 8 ? 'summer' : 'autumn'
}

/** `paperFor` for a Month of Dailies: its season's paper and tab. */
export const seasonStyle = (month: number) => paperFor(seasonOf(month))
