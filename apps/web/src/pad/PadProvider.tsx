import { type ReactNode, type RefObject, createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useRouter, useRouterState } from '@tanstack/react-router'
import { type Dispatcher, type PadPage, createDispatcher } from './dispatch.ts'
import { analogActive } from './input.ts'
import { getPadMode, setPadMode } from './mode.ts'
import { startPolling } from './poller.ts'
import { focusDefault, focusInto } from './spatial.ts'

const PadContext = createContext<Dispatcher | null>(null)

export function PadProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [dispatcher] = useState(() => createDispatcher(href => void router.navigate({ href })))
  const href = useRouterState({ select: s => s.resolvedLocation?.href })

  useEffect(() => {
    let analog = false
    return startPolling({
      frame: (frame, dt) => {
        const active = analogActive(frame)
        if (active && !analog) setPadMode(true)
        analog = active
        if (active) dispatcher.analog(frame, dt)
      },
      event: event => {
        if (event.kind === 'press') setPadMode(true)
        dispatcher.dispatch(event)
      },
      disconnect: () => setPadMode(false),
    })
  }, [dispatcher])

  useEffect(() => {
    if (href === undefined || !getPadMode()) return
    return afterRender(focusDefault)
  }, [href])

  return <PadContext value={dispatcher}>{children}</PadContext>
}

export const usePadDispatcher = (): Dispatcher | null => useContext(PadContext)

/** Runs `fn` once the frame after next has rendered; returns a cancel. */
function afterRender(fn: () => void): () => void {
  let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(fn)))
  return () => cancelAnimationFrame(raf)
}

/** Tells the generic pad actions about this page, for as long as it's mounted. */
export function usePadPage(page: PadPage): void {
  const dispatcher = usePadDispatcher()
  const latest = useRef(page)
  latest.current = page
  useEffect(() => {
    if (!dispatcher) return
    dispatcher.setPage(() => latest.current)
    return () => dispatcher.setPage(null)
  }, [dispatcher])
}

/**
 * While `open`, keeps the d-pad inside `ref` and lets B close it through `onClose`. On close, focus that
 * was lost goes back to `restore` (for a confirm that replaced its button), else to whatever had it on
 * open, else to the page default in pad mode.
 */
export function usePadContain(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
  restore?: RefObject<HTMLElement | null>,
): void {
  const dispatcher = usePadDispatcher()
  const close = useRef(onClose)
  close.current = onClose

  useLayoutEffect(() => {
    const root = ref.current
    if (!open || !root) return
    const opener = document.activeElement
    root.dataset.padContain = ''
    const unregister = dispatcher?.contain(root, () => close.current())
    if (getPadMode()) focusInto(root)
    return () => {
      unregister?.()
      delete root.dataset.padContain
      requestAnimationFrame(() => {
        const active = document.activeElement
        if (active && active !== document.body && active.isConnected) return
        const to = restore?.current ?? (opener instanceof HTMLElement && opener.isConnected ? opener : null)
        if (to && to !== document.body) to.focus()
        else if (getPadMode()) focusDefault()
      })
    }
  }, [dispatcher, ref, open, restore])
}
