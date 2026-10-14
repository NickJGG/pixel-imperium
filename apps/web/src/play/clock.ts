/** A Solve time or Best time: `m:ss`, or `h:mm:ss` from an hour up. Whole seconds, rounded down. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const s = String(total % 60).padStart(2, '0')
  const m = Math.floor(total / 60) % 60
  const h = Math.floor(total / 3600)
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`
}
