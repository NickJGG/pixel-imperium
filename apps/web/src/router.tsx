import { Outlet, createRootRoute, createRoute, createRouter, notFound, redirect, useRouterState } from '@tanstack/react-router'
import { accountReady, getAccount, useAccount } from './account.ts'
import { fetchCampaign, fetchCampaigns, fetchProfile, fetchPuzzle } from './api.ts'
import { LoadError, NotFound } from './EdgeStates.tsx'
import { pickCampaign, rememberCampaign } from './campaign/last-campaign.ts'
import { DailyPlayPage } from './daily/DailyPlayPage.tsx'
import { dailyId } from './daily/clock.ts'
import { MonthPage } from './daily/MonthPage.tsx'
import { MonthSkeleton } from './daily/MonthSkeleton.tsx'
import { loadDailyYear } from './daily/year.ts'
import { ProvincePage } from './campaign/ProvincePage.tsx'
import { ProvinceSkeleton } from './campaign/ProvinceSkeleton.tsx'
import { campaignProgress, continueAt } from './campaign/progress.ts'
import { PENDING_MS, installMorphNavigation, morphPendingMs } from './campaign/worlds/morph-nav.ts'
import { homeSearch } from './home/columns.ts'
import { HomePage } from './home/HomePage.tsx'
import { HomeSkeleton } from './home/HomeSkeleton.tsx'
import { ImportPrompt } from './ImportPrompt.tsx'
import { Hud, ThumbBar } from './Hud.tsx'
import { HandlePicker } from './me/HandlePicker.tsx'
import { SettingsPage } from './me/SettingsPage.tsx'
import { SettingsSkeleton } from './me/SettingsSkeleton.tsx'
import { PadProvider } from './pad/PadProvider.tsx'
import { PlayPage } from './play/PlayPage.tsx'
import { PlaySkeleton } from './play/PlaySkeleton.tsx'
import { campaignAlbum, yearAlbum, yearAlbumId, yearAlbumName, yearOfAlbum } from './profile/album.ts'
import { ProfilePage } from './profile/ProfilePage.tsx'
import { ProfileSkeleton } from './profile/ProfileSkeleton.tsx'
import { Fallback } from './skeleton/Skeleton.tsx'
import { getDone } from './tutorial/done.ts'
import { isBackPath, loadHandoff, loadLearnBack } from './tutorial/handoff.ts'
import { LearnPage } from './tutorial/LearnPage.tsx'
import { LearnSkeleton } from './tutorial/LearnSkeleton.tsx'
import { LessonPage } from './tutorial/LessonPage.tsx'
import { LessonSkeleton } from './tutorial/LessonSkeleton.tsx'
import { nextTrack, trackOf } from './tutorial/tracks.ts'
import styles from './App.module.css'

function Root() {
  const { needsHandle } = useAccount()
  // Play and a Lesson carry the HUD's pills in their own rail or top line, or place the HUD themselves.
  const playing = useRouterState({
    select: s => /^\/(?:play\/|daily\/[^/]+\/[^/]+\/[^/]+|learn\/[^/]+\/[^/]+)/.test(s.location.pathname),
  })
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
 * Dev only: `?conquest` replays the unveil for the latest conquered province, `?conquest=<provinceId>` for
 * that one, without marking it seen.
 */
const unveilSearch = (search: Record<string, unknown>): { conquest?: string | true } =>
  import.meta.env.DEV && 'conquest' in search
    ? { conquest: typeof search.conquest === 'string' && search.conquest !== '' ? search.conquest : true }
    : {}

/** The album opens on the province being worked through, or the last once every one is conquered. */
async function openAlbum(campaignId: string, search: { conquest?: string | true }): Promise<never> {
  const campaign = await loadCampaign(campaignId)
  const { storage } = getAccount()
  const progress = campaignProgress(campaign, storage)
  const province =
    continueAt(campaign, progress, id => storage.loadSolved(id) !== null)?.province ?? campaign.provinces.at(-1)
  if (!province) throw notFound()
  throw redirect({
    to: '/c/$campaignId/$provinceId',
    params: { campaignId: campaign.id, provinceId: province.id },
    search,
    replace: true,
  })
}

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: homeSearch,
  /**
   * The profile is the signed-in player's, for the Profile and Settings columns, and this Year's Dailies are for the
   * Daily column; Home stands without either.
   */
  loader: async () => {
    const id = pickCampaign(await fetchCampaigns())
    const [campaign, dailyYear, profile] = await Promise.all([
      id === null ? null : loadCampaign(id),
      loadDailyYear(new Date().getFullYear()).catch(() => null),
      accountReady.then(() => {
        const handle = getAccount().account?.handle
        return handle ? fetchProfile(handle).catch(() => null) : null
      }),
    ])
    return { campaign, dailyYear, profile }
  },
  component: () => {
    const { campaign, dailyYear, profile } = homeRoute.useLoaderData()
    return campaign ? (
      <HomePage campaign={campaign} dailyYear={dailyYear} profile={profile} />
    ) : (
      <main className={styles.message}>No campaigns yet.</main>
    )
  },
  pendingComponent: HomeSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
})

const campaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$campaignId',
  validateSearch: unveilSearch,
  beforeLoad: ({ params, search }) => openAlbum(params.campaignId, search),
  notFoundComponent: () => <NotFound>There’s no campaign by that name.</NotFound>,
})

const provinceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$campaignId/$provinceId',
  validateSearch: unveilSearch,
  loader: async ({ params }) => {
    const campaign = await loadCampaign(params.campaignId)
    const province = campaign.provinces.find(p => p.id === params.provinceId)
    if (!province) throw notFound()
    return { campaign, province }
  },
  component: () => (
    <ProvincePage {...provinceRoute.useLoaderData()} previewConquest={provinceRoute.useSearch().conquest} />
  ),
  pendingComponent: ProvinceSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
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
    if (!puzzle || !('campaignId' in puzzle)) throw notFound()
    return { puzzle, campaign: await loadCampaign(puzzle.campaignId) }
  },
  component: PlayPage,
  pendingComponent: PlaySkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
  notFoundComponent: () => <NotFound>There’s no puzzle by that name.</NotFound>,
})

/** A Month of Dailies, `month` being `01`–`12`; the Year's other Months stand beside it. */
const monthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/daily/$year/$month',
  loader: async ({ params }) => {
    const year = Number(params.year)
    const month = Number(params.month)
    if (!/^\d{4}$/.test(params.year) || !/^(0[1-9]|1[0-2])$/.test(params.month)) throw notFound()
    const [data] = await Promise.all([loadDailyYear(year), accountReady])
    if (!data) throw notFound()
    return { data, month }
  },
  component: () => <MonthPage {...monthRoute.useLoaderData()} />,
  pendingComponent: MonthSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
  notFoundComponent: () => <NotFound>There’s no month of Dailies at this address.</NotFound>,
})

/** A Daily, by its date; whether it can still be played is the page's to say. */
const dailyPlayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/daily/$year/$month/$day',
  loader: async ({ params: { year, month, day } }) => {
    const date = `${year}-${month}-${day}`
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw notFound()
    const [puzzle] = await Promise.all([fetchPuzzle(dailyId(date)), accountReady])
    if (!puzzle || !('daily' in puzzle)) throw notFound()
    return { puzzle, date }
  },
  component: DailyPlayPage,
  pendingComponent: PlaySkeleton,
  notFoundComponent: () => <NotFound>There’s no Daily to play for that date.</NotFound>,
})

const profileRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$handle',
  /** `c` picks the album; `edit` opens your showcase editor. */
  validateSearch: (search: Record<string, unknown>): { c?: string; edit?: true } => ({
    ...(typeof search.c === 'string' ? { c: search.c } : {}),
    ...(search.edit === true ? { edit: true as const } : {}),
  }),
  loaderDeps: ({ search }) => ({ c: search.c }),
  loader: async ({ params, deps }) => {
    const [profile, campaigns] = await Promise.all([fetchProfile(params.handle), fetchCampaigns()])
    if (!profile) throw notFound()
    // The switcher offers the campaigns the player has started, then their Years; a newcomer gets the default campaign.
    const started = campaigns.filter(c => profile.campaigns.some(pc => pc.id === c.id))
    const years = profile.years.flatMap(y => yearOfAlbum(y.id) ?? []).sort((a, b) => a - b)
    const tabs = [...started, ...years.map(y => ({ id: yearAlbumId(y), name: yearAlbumName(y) }))]
    const year = deps.c === undefined ? null : yearOfAlbum(deps.c)
    const dailyYear = year !== null && years.includes(year) ? await loadDailyYear(year) : null
    if (dailyYear) return { profile, album: yearAlbum(dailyYear), tabs }
    const id = started.find(c => c.id === deps.c)?.id ?? profile.campaigns[0]?.id ?? campaigns[0]?.id
    const campaign = id === undefined ? null : await fetchCampaign(id)
    return { profile, album: campaign && campaignAlbum(campaign), tabs }
  },
  component: ProfilePage,
  pendingComponent: ProfileSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
  notFoundComponent: () => <NotFound>No player goes by @{profileRoute.useParams().handle}.</NotFound>,
})

const profileSpreadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$handle/$campaignId/$provinceId',
  beforeLoad: ({ params: { handle, campaignId } }) => {
    throw redirect({ to: '/u/$handle', params: { handle }, search: { c: campaignId }, replace: true })
  },
})

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  validateSearch: (search: Record<string, unknown>): { error?: string } =>
    typeof search.error === 'string' ? { error: search.error } : {},
  loader: () => accountReady,
  component: SettingsPage,
  pendingComponent: SettingsSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
})

const backSearch = (search: Record<string, unknown>): { back?: string } =>
  isBackPath(search.back) ? { back: search.back } : {}

/** Learn opens on the track whose Lessons come next. */
const learnRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/learn',
  validateSearch: backSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/learn/$track', params: { track: nextTrack(getDone()).id }, search, replace: true })
  },
})

/** One track's Lessons open wide, the other track a spine beside it; `back` is the page Learn was opened from. */
const trackRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/learn/$track',
  validateSearch: backSearch,
  loaderDeps: ({ search }) => ({ back: search.back }),
  loader: async ({ params, deps }) => {
    const track = trackOf(params.track)
    if (!track) throw notFound()
    return { track, back: await loadLearnBack(deps.back) }
  },
  component: () => <LearnPage {...trackRoute.useLoaderData()} />,
  pendingComponent: LearnSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
  notFoundComponent: () => <NotFound>There’s no track of Lessons by that name.</NotFound>,
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
  pendingComponent: LessonSkeleton,
  notFoundComponent: () => <NotFound>There’s no lesson by that name.</NotFound>,
})

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    campaignRoute,
    provinceRoute,
    playRoute,
    monthRoute,
    dailyPlayRoute,
    profileRoute,
    profileSpreadRoute,
    settingsRoute,
    learnRoute,
    trackRoute,
    lessonRoute,
  ]),
  defaultPendingComponent: Fallback,
  defaultPendingMs: PENDING_MS,
})

installMorphNavigation(router)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
