/** Each seat's color, as `--seat-<n>` from 1 in tokens.css, by name for screen readers and colorblind players. */
export const SEAT_NAMES = ['Gold', 'Pink', 'Mint', 'Periwinkle'] as const

export const seatColor = (seat: number) => `--seat-${seat + 1}`

/** "F" for "Guest Fox", else the Handle's first letter. */
export const initialOf = (name: string) => (name.replace(/^Guest /, '')[0] ?? '?').toUpperCase()
