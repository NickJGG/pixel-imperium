import { getRouteApi } from '@tanstack/react-router'
import { WorkshopDraftPage } from './MakePage.tsx'
import { PublishedPage } from './PublishedPage.tsx'

const route = getRouteApi('/workshop/p/$id')

/** A draft in the editor, or one of the Author's published puzzles. */
export function WorkshopPuzzlePage() {
  const data = route.useLoaderData()
  return data.kind === 'published' ? (
    <PublishedPage key={data.puzzle.id} puzzle={data.puzzle} />
  ) : (
    <WorkshopDraftPage key={data.draftKey.id} draftKey={data.draftKey} stored={data.stored} />
  )
}
