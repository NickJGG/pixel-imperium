import { DEVICE_TOKEN } from '@pixel-imperium/protocol'

const KEY = 'pixel-imperium:device'

/** Kept for the tab when storage is blocked, so a reconnect is still the same guest. */
let fallback: string | null = null

function fresh(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** This device's co-op identity while signed out: its guest name, its seat, and what a Host's Remove applies to. */
export function deviceToken(): string {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored && DEVICE_TOKEN.test(stored)) return stored
  } catch {}
  fallback ??= fresh()
  try {
    localStorage.setItem(KEY, fallback)
  } catch {}
  return fallback
}
