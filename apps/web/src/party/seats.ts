import type { PartySeat } from '@pixel-imperium/protocol'

/** Each seat's color, as `--seat-<n>` from 1 in tokens.css, by name for screen readers and colorblind players. */
export const SEAT_NAMES = ['Gold', 'Pink', 'Mint', 'Periwinkle'] as const

export const seatColor = (seat: number) => `--seat-${seat + 1}`

/** "F" for "Guest Fox", else the Handle's first letter. */
export const initialOf = (name: string) => (name.replace(/^Guest /, '')[0] ?? '?').toUpperCase()

/** "@mara", or "Guest Fox"; `short` drops the "Guest " for a sentence's subject. */
export const seatLabel = ({ name, account }: Pick<PartySeat, 'name' | 'account'>, short = false) =>
  account ? `@${name}` : short ? name.replace(/^Guest /, '') : name

/** "@nick", "@nick and Fox", "@nick, Fox and @mara". */
export function namesOf(seats: readonly PartySeat[]): string {
  const names = seats.map(s => seatLabel(s))
  return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
}
