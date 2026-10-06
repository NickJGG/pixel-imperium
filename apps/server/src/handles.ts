/** Handles are `[a-z0-9_]{3,20}`, unique and reserved-word checks ignoring case. */

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

export function isReserved(handle: string): boolean {
  return RESERVED.has(handle.toLowerCase())
}

export function isValidHandle(handle: string): boolean {
  return new RegExp(`^[a-z0-9_]{${HANDLE_MIN},${HANDLE_MAX}}$`, 'i').test(handle) && !isReserved(handle)
}

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
  const base = slugify(name)
  for (let n = 1; ; n++) {
    const suffix = n === 1 ? '' : String(n)
    const candidate = base.slice(0, HANDLE_MAX - suffix.length) + suffix
    if (!isReserved(candidate) && !(await isTaken(candidate))) return candidate
  }
}
