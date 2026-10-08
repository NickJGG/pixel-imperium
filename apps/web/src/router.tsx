import { Outlet, createRootRoute, createRoute, createRouter, notFound } from '@tanstack/react-router'
import { accountReady, useAccount } from './account.ts'
import { fetchCampaign, fetchCampaigns, fetchProfile, fetchPuzzle } from './api.ts'
import { AppHeader, ThumbBar } from './AppHeader.tsx'
import { LoadError, Loading, NotFound } from './EdgeStates.tsx'
import { CampaignPage } from './campaign/CampaignPage.tsx'
import { pickCampaign, rememberCampaign } from './campaign/last-campaign.ts'
import { ProvincePage } from './campaign/ProvincePage.tsx'
import { ImportPrompt } from './ImportPrompt.tsx'
import { HandlePicker } from './me/HandlePicker.tsx'
import { SettingsPage } from './me/SettingsPage.tsx'
import { PlayPage } from './play/PlayPage.tsx'
import { ProfilePage } from './profile/ProfilePage.tsx'
import { ProfileSpread } from './profile/ProfileSpread.tsx'
import styles from './App.module.css'

function Root() {
  const { needsHandle } = useAccount()
  return (
    <div className={styles.app}>
      <AppHeader />
      {needsHandle ? <HandlePicker /> : <Outlet />}
      <ThumbBar />
      <ImportPrompt />
    </div>
  )
}

const rootRoute = createRootRoute({
  component: Root,
  errorComponent: LoadError,
  notFoundComponent: () => <NotFound>There’s no page at this address.</NotFound>,
})

async function loadCampaign(id: string) {
  const [campaign] = await Promise.all([fetchCampaign(id), accountReady])
  if (!campaign) throw notFound()
  rememberCampaign(campaign)
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
  notFoundComponent: () => <NotFound>There’s no campaign by that name.</NotFound>,
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
  notFoundComponent: () => (
    <NotFound>There’s no province called “{provinceRoute.useParams().provinceId}”. It might have been renamed.</NotFound>
  ),
})

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$id',
  /** Dev only: `?conquest` shows the after panel as if this solve had just conquered the province. */
  validateSearch: (search: Record<string, unknown>): { conquest?: true } =>
    import.meta.env.DEV && 'conquest' in search ? { conquest: true } : {},
  loader: async ({ params }) => {
    const puzzle = await fetchPuzzle(params.id)
    if (!puzzle) throw notFound()
    return { puzzle, campaign: await loadCampaign(puzzle.campaignId) }
  },
  component: PlayPage,
  notFoundComponent: () => <NotFound>There’s no puzzle by that name.</NotFound>,
})

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
  notFoundComponent: () => <NotFound>No player goes by @{profileRoute.useParams().handle}.</NotFound>,
})

const profileSpreadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$handle/$campaignId/$provinceId',
  loader: async ({ params }) => {
    const [profile, campaign] = await Promise.all([fetchProfile(params.handle), fetchCampaign(params.campaignId)])
    const province = campaign?.provinces.find(p => p.id === params.provinceId)
    if (!profile || !campaign || !province) throw notFound()
    return { profile, campaign, province }
  },
  component: ProfileSpread,
  notFoundComponent: () => <NotFound>That player has no such page.</NotFound>,
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
  routeTree: rootRoute.addChildren([
    homeRoute,
    campaignRoute,
    provinceRoute,
    playRoute,
    profileRoute,
    profileSpreadRoute,
    settingsRoute,
  ]),
  defaultPendingComponent: Loading,
  defaultPendingMs: 300,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
