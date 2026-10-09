/**
 * The Lessons the player has finished, as `lessonKey`s, kept in localStorage; for an account they also
 * sync to the server (see `account.ts`), unioned both ways.
 */
import { useSyncExternalStore } from 'react'

const KEY = 'pixel-imperium:lessons-done'

function load(): ReadonlySet<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter(k => typeof k === 'string') : [])
  } catch {
    return new Set()
  }
}

let done = load()
const listeners = new Set<() => void>()

/** Replaced, never mutated, whenever a key is added. */
export const getDone = (): ReadonlySet<string> => done

export function subscribeDone(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Unions `keys` in, from this device or the server. */
export function recordDone(keys: Iterable<string>): void {
  const next = new Set([...done, ...keys])
  if (next.size === done.size) return
  done = next
  try {
    localStorage.setItem(KEY, JSON.stringify([...next]))
  } catch {}
  for (const listener of listeners) listener()
}

export const markDone = (key: string): void => recordDone([key])

export const useLessonsDone = (): ReadonlySet<string> => useSyncExternalStore(subscribeDone, getDone)
