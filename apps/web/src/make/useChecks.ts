import { useEffect, useRef, useState } from 'react'
import type { Checks } from '@pixel-imperium/nonogram'
import type { Draft } from './draft.ts'

const DEBOUNCE_MS = 150

/**
 * The draft's checks from a worker, a beat after each change. Uniqueness can backtrack for seconds on a big
 * board, so a change that supersedes a running check kills the worker rather than queueing behind it.
 */
export function useChecks(draft: Draft): Checks | null {
  const { width, height } = draft
  const key = draft.cells.map(c => (c === null ? '.' : '#')).join('')
  const [checks, setChecks] = useState<Checks | null>(null)
  const worker = useRef<{ worker: Worker; busy: boolean } | null>(null)
  const seq = useRef(0)

  useEffect(
    () => () => {
      worker.current?.worker.terminate()
      worker.current = null
    },
    [],
  )

  useEffect(() => {
    const sent = ++seq.current
    const timer = setTimeout(() => {
      if (worker.current?.busy) {
        worker.current.worker.terminate()
        worker.current = null
      }
      if (!worker.current) {
        const w = new Worker(new URL('./checks.worker.ts', import.meta.url), { type: 'module' })
        const current = { worker: w, busy: false }
        w.addEventListener('message', (e: MessageEvent<{ seq: number; checks: Checks }>) => {
          current.busy = false
          if (e.data.seq === seq.current) setChecks(e.data.checks)
        })
        worker.current = current
      }
      worker.current.busy = true
      worker.current.worker.postMessage({ seq: sent, width, height, filled: Array.from(key, c => c === '#') })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [width, height, key])

  return checks
}
