/**
 * Player preferences, persisted to localStorage; the theme is applied as `data-theme` on <html>.
 * For an account, the assists also sync to the server (see `account.ts`); the theme and sound stay per device.
 */
import { useSyncExternalStore } from 'react'
import type { Assists } from '@pixel-imperium/protocol'

export type Theme = 'auto' | 'light' | 'dark'

export interface Settings extends Assists {
  theme: Theme
  sound: boolean
}

export function assistsOf({ fadeClues, impossibleLines, autoMarkEmptyLines, crosshair, lockLine }: Settings): Assists {
  return { fadeClues, impossibleLines, autoMarkEmptyLines, crosshair, lockLine }
}

const defaults: Settings = {
  theme: 'dark',
  sound: true,
  fadeClues: true,
  impossibleLines: true,
  autoMarkEmptyLines: true,
  crosshair: true,
  lockLine: false,
}

const KEY = 'pixel-imperium:settings'

function load(): Settings {
  let saved: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    if (parsed && typeof parsed === 'object') saved = parsed as Record<string, unknown>
  } catch {}
  const settings = { ...defaults }
  for (const k of Object.keys(defaults) as (keyof Settings)[]) {
    if (typeof saved[k] === typeof defaults[k]) Object.assign(settings, { [k]: saved[k] })
  }
  if (!['auto', 'light', 'dark'].includes(settings.theme)) settings.theme = defaults.theme
  return settings
}

function applyTheme(theme: Theme) {
  if (theme === 'auto') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
}

let current = load()
applyTheme(current.theme)
const listeners = new Set<() => void>()

export const getSettings = (): Settings => current

export function subscribeSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch }
  applyTheme(current.theme)
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {}
  for (const listener of listeners) listener()
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribeSettings, getSettings)
}
