/** At most `limit` calls per key in each `windowMs`, counted in fixed windows. */
export function rateLimiter(limit: number, windowMs: number, now = Date.now) {
  const windows = new Map<string, { start: number; count: number }>()
  return (key: string): boolean => {
    const t = now()
    const w = windows.get(key)
    if (!w || t - w.start >= windowMs) {
      if (windows.size > 10_000) windows.clear()
      windows.set(key, { start: t, count: 1 })
      return true
    }
    return ++w.count <= limit
  }
}
