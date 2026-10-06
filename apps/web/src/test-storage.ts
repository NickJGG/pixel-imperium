import { vi } from 'vitest'

/** Replaces `localStorage` with an in-memory one; undo with `vi.unstubAllGlobals()`. */
export function stubStorage(): Map<string, string> {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    get length() {
      return data.size
    },
    key: (i: number) => [...data.keys()][i] ?? null,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  })
  return data
}
