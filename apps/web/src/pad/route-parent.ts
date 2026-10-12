/**
 * Where B goes from a page, by its path. `/play` isn't covered: its parent is the puzzle's province, which
 * the path doesn't name, so PlayPage supplies it once solved, as it does a Daily's Month. Home's own pages go
 * back to Home with their column open.
 */
export function routeParent(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  const [first, second] = parts
  if (first === 'c') return parts.length === 3 ? '/' : null
  if (first === 'daily') return parts.length === 3 ? '/?open=daily' : null
  if (first === 'learn') return parts.length === 3 ? '/learn' : parts.length === 1 ? '/?open=learn' : null
  if (first === 'u') return parts.length === 4 ? `/u/${second}` : parts.length === 2 ? '/?open=profile' : null
  if (first === 'settings') return '/?open=settings'
  return null
}
