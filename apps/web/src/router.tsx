import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { fetchPuzzle, fetchPuzzles } from './api.ts'
import { AppHeader } from './AppHeader.tsx'
import { PuzzleList } from './list/PuzzleList.tsx'
import { PlayPage } from './play/PlayPage.tsx'
import styles from './App.module.css'

const rootRoute = createRootRoute({
  component: () => (
    <div className={styles.app}>
      <AppHeader />
      <Outlet />
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
  loader: fetchPuzzles,
  component: PuzzleList,
})

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$id',
  loader: ({ params }) => fetchPuzzle(params.id),
  component: PlayPage,
})

export const router = createRouter({ routeTree: rootRoute.addChildren([listRoute, playRoute]) })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
