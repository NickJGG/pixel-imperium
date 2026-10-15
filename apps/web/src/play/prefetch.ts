import { useEffect } from 'react'
import { prefetchPuzzle } from '../content.ts'

/** A door's handlers that load its puzzle's clues on intent: a pointer over it, a press, or focus, which a pad moves. */
export function prefetchOn(id: string) {
  const load = () => prefetchPuzzle(id)
  return { onPointerEnter: load, onPointerDown: load, onFocus: load }
}

/** Loads the clues of the one puzzle a page points at, as it mounts. */
export function usePrefetch(id: string | null | undefined): void {
  useEffect(() => {
    if (id) prefetchPuzzle(id)
  }, [id])
}
