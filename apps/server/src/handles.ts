/** Handles are `[a-z0-9_]{3,20}`; uniqueness, reserved-word and blocklist checks ignore case. */
import type { HandleProblem } from '@pixel-imperium/protocol'

export const HANDLE_MIN = 3
export const HANDLE_MAX = 20

const RESERVED = new Set([
  'admin',
  'administrator',
  'api',
  'auth',
  'help',
  'login',
  'logout',
  'me',
  'mod',
  'moderator',
  'new',
  'pixel_imperium',
  'pixelimperium',
  'play',
  'puzzle',
  'puzzles',
  'root',
  'settings',
  'signin',
  'signout',
  'signup',
  'support',
  'system',
  'u',
  'user',
  'users',
])

/** Matched anywhere in the handle, so only words that rarely occur inside innocent ones. */
const BLOCKED = ['bitch', 'cunt', 'fag', 'fuck', 'hitler', 'nigga', 'nigger', 'retard', 'shit', 'slut', 'whore']

export function isReserved(handle: string): boolean {
  return RESERVED.has(handle.toLowerCase())
}

export function isBlocked(handle: string): boolean {
  const folded = handle.toLowerCase().replace(/[_0-9]/g, '')
  return BLOCKED.some(word => folded.includes(word))
}

/** Problems found without the database; `taken` needs a lookup. */
export function handleProblem(handle: string): Exclude<HandleProblem, 'taken'> | null {
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return 'length'
  if (!/^[a-z0-9_]+$/i.test(handle)) return 'characters'
  if (isReserved(handle)) return 'reserved'
  if (isBlocked(handle)) return 'blocked'
  return null
}

export const isValidHandle = (handle: string): boolean => handleProblem(handle) === null

/** Folds a display name into handle characters; names with too little to keep fall back to `player`. */
export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, HANDLE_MAX)
    .replace(/_+$/, '')
  return slug.length >= HANDLE_MIN ? slug : 'player'
}

/**
 * The first free handle in `base`, `base2`, `base3`…, trimming `base` so the suffix fits.
 * `isTaken` must compare case-insensitively.
 */
export async function provisionalHandle(name: string, isTaken: (handle: string) => Promise<boolean>): Promise<string> {
  const slug = slugify(name)
  const base = isBlocked(slug) ? 'player' : slug
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '' : String(n)
    const candidate = base.slice(0, HANDLE_MAX - suffix.length) + suffix
    if (!isReserved(candidate) && !(await isTaken(candidate))) return candidate
  }
}
