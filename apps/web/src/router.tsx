import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { accountReady } from './account.ts'
import { fetchPuzzle, fetchPuzzles } from './api.ts'
import { AppHeader } from './AppHeader.tsx'
import { ImportPrompt } from './ImportPrompt.tsx'
import { PuzzleList } from './list/PuzzleList.tsx'
import { PlayPage } from './play/PlayPage.tsx'
import styles from './App.module.css'

const rootRoute = createRootRoute({
  component: () => (
    <div className={styles.app}>
      <AppHeader />
      <Outlet />
      <ImportPrompt />
    </div>
  ),
  errorComponent: ({ error }) => (
    <main className={styles.message}>
      <p>Something went wrong: {error instanceof Error ? error.message : String(error)}</p>
      <Link to="/">Back to puzzles</Link>
    </main>
  ),
})

const listRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>): { filter?: 'open' | 'solved' } =>
    search.filter === 'open' || search.filter === 'solved' ? { filter: search.filter } : {},
  loader: async () => (await Promise.all([fetchPuzzles(), accountReady]))[0],
  component: PuzzleList,
})

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$id',
  loader: async ({ params }) => (await Promise.all([fetchPuzzle(params.id), accountReady]))[0],
  component: PlayPage,
})

export const router = createRouter({ routeTree: rootRoute.addChildren([listRoute, playRoute]) })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
