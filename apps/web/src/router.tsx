import { Link, Outlet, createRootRoute, createRoute, createRouter, notFound } from '@tanstack/react-router'
import { accountReady, useAccount } from './account.ts'
import { fetchCampaign, fetchCampaigns, fetchProfile, fetchPuzzle } from './api.ts'
import { AppHeader } from './AppHeader.tsx'
import { CampaignPage } from './campaign/CampaignPage.tsx'
import { pickCampaign, rememberCampaign } from './campaign/last-campaign.ts'
import { ProvincePage } from './campaign/ProvincePage.tsx'
import { ImportPrompt } from './ImportPrompt.tsx'
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
      <Link to="/">Back to the map</Link>
    </main>
  ),
})

async function loadCampaign(id: string) {
  const [campaign] = await Promise.all([fetchCampaign(id), accountReady])
  if (!campaign) throw notFound()
  rememberCampaign(campaign.id)
  return campaign
}

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  loader: async () => {
    const campaigns = await fetchCampaigns()
    const id = pickCampaign(campaigns)
    return id === null ? null : { campaign: await loadCampaign(id), campaigns }
  },
  component: () => {
    const data = homeRoute.useLoaderData()
    if (!data) return <main className={styles.message}>No campaigns yet.</main>
    return <CampaignPage {...data} />
  },
})

const campaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$campaignId',
  loader: async ({ params }) => {
    const [campaign, campaigns] = await Promise.all([loadCampaign(params.campaignId), fetchCampaigns()])
    return { campaign, campaigns }
  },
  component: () => <CampaignPage {...campaignRoute.useLoaderData()} />,
  notFoundComponent: () => <Missing what="campaign" />,
})

const provinceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$campaignId/$provinceId',
  loader: async ({ params }) => {
    const campaign = await loadCampaign(params.campaignId)
    const province = campaign.provinces.find(p => p.id === params.provinceId)
    if (!province) throw notFound()
    return { campaign, province }
  },
  component: () => <ProvincePage {...provinceRoute.useLoaderData()} />,
  notFoundComponent: () => <Missing what="province" />,
})

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$id',
  loader: async ({ params }) => {
    const puzzle = await fetchPuzzle(params.id)
    return { puzzle, campaign: await loadCampaign(puzzle.campaignId) }
  },
  component: PlayPage,
})

function Missing({ what }: { what: string }) {
  return (
    <main className={styles.message}>
      <p>There's no such {what}.</p>
      <Link to="/">Back to the map</Link>
    </main>
  )
}

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$handle',
  validateSearch: (search: Record<string, unknown>): { c?: string } =>
    typeof search.c === 'string' ? { c: search.c } : {},
  loaderDeps: ({ search }) => ({ c: search.c }),
  loader: async ({ params, deps }) => {
    const [profile, campaigns] = await Promise.all([fetchProfile(params.handle), fetchCampaigns()])
    if (!profile) throw notFound()
    // The switcher offers the campaigns the player has started; a newcomer gets the default campaign.
    const started = campaigns.filter(c => profile.campaigns.some(pc => pc.id === c.id))
    const id = started.find(c => c.id === deps.c)?.id ?? profile.campaigns[0]?.id ?? campaigns[0]?.id
    const campaign = id === undefined ? null : await fetchCampaign(id)
    return { profile, campaign, started }
  },
  component: ProfilePage,
  notFoundComponent: () => {
    const { handle } = profileRoute.useParams()
    return (
      <main className={styles.message}>
        <p>No player goes by @{handle}.</p>
        <Link to="/">Back to the map</Link>
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
  routeTree: rootRoute.addChildren([homeRoute, campaignRoute, provinceRoute, playRoute, profileRoute, settingsRoute]),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
