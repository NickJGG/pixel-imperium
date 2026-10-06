import { Link, Outlet, createRootRoute, createRoute, createRouter, notFound } from '@tanstack/react-router'
import { accountReady, useAccount } from './account.ts'
import { fetchProfile, fetchPuzzle, fetchPuzzles } from './api.ts'
import { AppHeader } from './AppHeader.tsx'
import { ImportPrompt } from './ImportPrompt.tsx'
import { PuzzleList } from './list/PuzzleList.tsx'
import { HandlePicker } from './me/HandlePicker.tsx'
import { SettingsPage } from './me/SettingsPage.tsx'
import { PlayPage } from './play/PlayPage.tsx'
import { ProfilePage } from './profile/ProfilePage.tsx'
import styles from './App.module.css'

function Root() {
  const { needsHandle } = useAccount()
  return (
    <div className={styles.app}>
      <AppHeader />
      {needsHandle ? <HandlePicker /> : <Outlet />}
      <ImportPrompt />
    </div>
  )
}

const rootRoute = createRootRoute({
  component: Root,
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

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$handle',
  loader: async ({ params }) => {
    const profile = await fetchProfile(params.handle)
    if (!profile) throw notFound()
    return profile
  },
  component: ProfilePage,
  notFoundComponent: () => {
    const { handle } = profileRoute.useParams()
    return (
      <main className={styles.message}>
        <p>No player goes by @{handle}.</p>
        <Link to="/">Back to puzzles</Link>
      </main>
    )
  },
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === 'string' ? { error: search.error } : {},
  loader: () => accountReady,
  component: SettingsPage,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([listRoute, playRoute, profileRoute, settingsRoute]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
