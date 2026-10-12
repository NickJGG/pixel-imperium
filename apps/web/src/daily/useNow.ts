import { useEffect, useState } from 'react'

/** The time, updated on each minute boundary (`minuteTick`) or every second. */
export function useNow(minuteTick = true): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const step = minuteTick ? 60_000 : 1000
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const t = Date.now()
      setNow(new Date(t))
      timer = setTimeout(tick, step - (t % step))
    }
    timer = setTimeout(tick, step - (Date.now() % step))
    return () => clearTimeout(timer)
  }, [minuteTick])
  return now
}
