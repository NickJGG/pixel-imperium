import { type ReactNode, createContext, useContext, useEffect, useState } from 'react'
import { createDispatcher, type Dispatcher } from './dispatch.ts'
import { analogActive } from './input.ts'
import { setPadMode } from './mode.ts'
import { startPolling } from './poller.ts'

const PadContext = createContext<Dispatcher | null>(null)

export function PadProvider({ children }: { children: ReactNode }) {
  const [dispatcher] = useState(createDispatcher)

  useEffect(() => {
    let analog = false
    return startPolling({
      frame: frame => {
        const active = analogActive(frame)
        if (active && !analog) setPadMode(true)
        analog = active
      },
      event: event => {
        if (event.kind === 'press') setPadMode(true)
        dispatcher.dispatch(event)
      },
      disconnect: () => setPadMode(false),
    })
  }, [dispatcher])

  return <PadContext value={dispatcher}>{children}</PadContext>
}

export const usePadDispatcher = (): Dispatcher | null => useContext(PadContext)
