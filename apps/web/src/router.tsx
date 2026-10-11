import { Outlet, createRootRoute, createRoute, createRouter, notFound, redirect, useRouterState } from '@tanstack/react-router'
import { accountReady, useAccount } from './account.ts'
import { fetchCampaign, fetchCampaigns, fetchProfile, fetchPuzzle } from './api.ts'
import { LoadError, Loading, NotFound } from './EdgeStates.tsx'
import { CampaignPage } from './campaign/CampaignPage.tsx'
import { pickCampaign, rememberCampaign } from './campaign/last-campaign.ts'
import { ProvincePage } from './campaign/ProvincePage.tsx'
import { ImportPrompt } from './ImportPrompt.tsx'
import { Hud, ThumbBar } from './Hud.tsx'
import { HandlePicker } from './me/HandlePicker.tsx'
import { SettingsPage } from './me/SettingsPage.tsx'
import { PadProvider } from './pad/PadProvider.tsx'
import { PlayPage } from './play/PlayPage.tsx'
import { ProfilePage } from './profile/ProfilePage.tsx'
import { ProfileSpread } from './profile/ProfileSpread.tsx'
import { getDone } from './tutorial/done.ts'
import { isBackPath, loadHandoff, loadLearnBack } from './tutorial/handoff.ts'
import { LearnPage } from './tutorial/LearnPage.tsx'
import { LessonPage } from './tutorial/LessonPage.tsx'
import { TRACKS, firstUnfinished, trackOf } from './tutorial/tracks.ts'
import styles from './App.module.css'

function Root() {
  const { needsHandle } = useAccount()
  // Play and a Lesson carry the HUD's pills in their own rail or top line, or place the HUD themselves.
  const playing = useRouterState({ select: s => /^\/(?:play\/|learn\/[^/]+\/[^/]+)/.test(s.location.pathname) })
  return (
    <PadProvider>
      <div className={styles.app}>
        {!playing && <Hud />}
        {needsHandle ? <HandlePicker /> : <Outlet />}
        <ThumbBar />
        <ImportPrompt />
      </div>
    </PadProvider>
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

/**
 * Dev only: `?conquest` replays home's unveil for the latest conquered province, `?conquest=<provinceId>` for
 * that one, without marking it seen.
 */
const unveilSearch = (search: Record<string, unknown>): { conquest?: string | true } =>
  import.meta.env.DEV && 'conquest' in search
    ? { conquest: typeof search.conquest === 'string' && search.conquest !== '' ? search.conquest : true }
    : {}

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: unveilSearch,
  loader: async () => {
    const campaigns = await fetchCampaigns()
    const id = pickCampaign(campaigns)
    return id === null ? null : { campaign: await loadCampaign(id), campaigns }
  },
  component: () => {
    const data = homeRoute.useLoaderData()
    const { conquest } = homeRoute.useSearch()
    if (!data) return <main className={styles.message}>No campaigns yet.</main>
    return <CampaignPage {...data} previewConquest={conquest} />
  },
})

const campaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$campaignId',
  validateSearch: unveilSearch,
  loader: async ({ params }) => {
    const [campaign, campaigns] = await Promise.all([loadCampaign(params.campaignId), fetchCampaigns()])
    return { campaign, campaigns }
  },
  component: () => <CampaignPage {...campaignRoute.useLoaderData()} previewConquest={campaignRoute.useSearch().conquest} />,
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
  /** Dev only: `?conquest` opens the province as if a Conquest had just unlocked it, fog dropping away. */
  validateSearch: (search: Record<string, unknown>): { conquest?: true } =>
    import.meta.env.DEV && 'conquest' in search ? { conquest: true } : {},
  component: () => (
    <ProvincePage {...provinceRoute.useLoaderData()} previewUnlock={provinceRoute.useSearch().conquest === true} />
  ),
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

const backSearch = (search: Record<string, unknown>): { back?: string } =>
  isBackPath(search.back) ? { back: search.back } : {}

/** Every Lesson of both tracks; `back` is the page it was opened from. */
const learnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/learn',
  validateSearch: backSearch,
  loaderDeps: ({ search }) => ({ back: search.back }),
  loader: ({ deps }) => loadLearnBack(deps.back),
  component: () => <LearnPage back={learnRoute.useLoaderData()} />,
})

/**
 * One Lesson. `learn` means it was opened from Learn, and `back` is then Learn's own; otherwise it's a deep
 * link, and the track hands back to `back` when it's done or skipped.
 */
const lessonRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/learn/$track/$lesson',
  validateSearch: (search: Record<string, unknown>): { back?: string; learn?: true } => ({
    ...backSearch(search),
    ...(search.learn === true ? { learn: true as const } : {}),
  }),
  loaderDeps: ({ search }) => ({ back: search.back, learn: search.learn }),
  loader: async ({ params, deps }) => {
    const track = trackOf(params.track)
    const index = track?.lessons.findIndex(l => l.id === params.lesson) ?? -1
    if (!track || index === -1) throw notFound()
    return { track, index, handoff: deps.learn ? null : await loadHandoff(deps.back) }
  },
  component: () => {
    const { track, index, handoff } = lessonRoute.useLoaderData()
    const { back, learn } = lessonRoute.useSearch()
    return (
      <LessonPage
        key={`${track.id}:${index}`}
        track={track}
        index={index}
        handoff={handoff}
        back={back ?? '/'}
        learn={learn === true}
      />
    )
  },
  notFoundComponent: () => <NotFound>There’s no lesson by that name.</NotFound>,
})

/** The old Techniques address, from before each Lesson had its own. */
const techniquesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/learn/techniques',
  validateSearch: backSearch,
  beforeLoad: ({ search }) => {
    const track = TRACKS.techniques
    const lesson = firstUnfinished(track, getDone()) ?? track.lessons[0]!
    throw redirect({ to: '/learn/$track/$lesson', params: { track: track.id, lesson: lesson.id }, search, replace: true })
  },
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
    learnRoute,
    lessonRoute,
    techniquesRoute,
  ]),
  defaultPendingComponent: Loading,
  defaultPendingMs: 300,
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
