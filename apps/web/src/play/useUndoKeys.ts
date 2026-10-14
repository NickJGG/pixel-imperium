import { useEffect } from 'react'
import type { PlayStore } from './store.ts'

/** Ctrl/Cmd+Z undoes; Ctrl/Cmd+Y and Ctrl/Cmd+Shift+Z redo. Paused, either only resumes the clock. */
export function useUndoKeys(store: PlayStore): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return
      const key = e.key.toLowerCase()
      if (key !== 'z' && key !== 'y') return
      if (store.getState().paused) store.resume()
      else if (key === 'z' && !e.shiftKey) store.undo()
      else store.redo()
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [store])
}
