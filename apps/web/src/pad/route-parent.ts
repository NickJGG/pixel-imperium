/**
 * Where B goes from a page, by its path. `/play` isn't covered: its parent is the puzzle's province, which
 * the path doesn't name, so PlayPage supplies it once solved.
 */
export function routeParent(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  const [first, second] = parts
  if (first === 'c') return parts.length === 3 ? '/' : null
  if (first === 'learn') return parts.length === 3 ? '/learn' : parts.length === 1 ? '/' : null
  if (first === 'u') return parts.length === 4 ? `/u/${second}` : parts.length === 2 ? '/' : null
  if (first === 'settings') return '/'
  return null
}
