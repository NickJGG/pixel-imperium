import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  notFound,
  redirect,
  useRouterState,
} from '@tanstack/react-router'
import type { Campaign, CampaignSummary, MadePuzzleSummary, PuzzleClues, RetiredError } from '@pixel-imperium/protocol'
import { accountReady, getAccount, useAccount } from './account.ts'
import { fetchMade, fetchProfile, isRetired, putDraftCampaign } from './api.ts'
import * as content from './content.ts'
import { LoadError, NotFound, Retired } from './EdgeStates.tsx'
import { CampaignsPage } from './campaign/CampaignsPage.tsx'
import { CampaignsSkeleton } from './campaign/CampaignsSkeleton.tsx'
import { newestFeatured } from './campaign/campaigns.ts'
import { pickCampaign, rememberCampaign, rememberCampaigns } from './campaign/last-campaign.ts'
import { markStarted, seedStarted, startedCampaigns } from './campaign/started-campaigns.ts'
import { DailyPlayPage } from './daily/DailyPlayPage.tsx'
import { dailyId } from './daily/clock.ts'
import { MonthPage } from './daily/MonthPage.tsx'
import { MonthSkeleton } from './daily/MonthSkeleton.tsx'
import { loadDailyYear } from './daily/year.ts'
import { ProvincePage } from './campaign/ProvincePage.tsx'
import { ProvinceSkeleton } from './campaign/ProvinceSkeleton.tsx'
import { PENDING_MS, installMorphNavigation, morphPendingMs } from './campaign/worlds/morph-nav.ts'
import { homeSearch } from './home/columns.ts'
import { HomePage } from './home/HomePage.tsx'
import { HomeSkeleton } from './home/HomeSkeleton.tsx'
import { ImportPrompt } from './ImportPrompt.tsx'
import { Hud, ThumbBar } from './Hud.tsx'
import { type DraftKey, type StoredDraft, newDraftId, openingCopy } from './make/draft-store.ts'
import type { Draft } from './make/draft.ts'
import { HandlePicker } from './me/HandlePicker.tsx'
import { SettingsPage } from './me/SettingsPage.tsx'
import { SettingsSkeleton } from './me/SettingsSkeleton.tsx'
import { PadProvider } from './pad/PadProvider.tsx'
import { PlayPage } from './play/PlayPage.tsx'
import { PlaySkeleton } from './play/PlaySkeleton.tsx'
import { signedOutStorage } from './play/progress-storage.ts'
import { campaignAlbum, yearAlbum, yearAlbumId, yearAlbumName, yearOfAlbum } from './profile/album.ts'
import { ProfilePage } from './profile/ProfilePage.tsx'
import { ProfileSkeleton } from './profile/ProfileSkeleton.tsx'
import { dayKey } from './profile/activity.ts'
import { Fallback } from './skeleton/Skeleton.tsx'
import { getDone } from './tutorial/done.ts'
import { isBackPath, loadHandoff, loadLearnBack } from './tutorial/handoff.ts'
import { LearnPage } from './tutorial/LearnPage.tsx'
import { LearnSkeleton } from './tutorial/LearnSkeleton.tsx'
import { LessonPage } from './tutorial/LessonPage.tsx'
import { LessonSkeleton } from './tutorial/LessonSkeleton.tsx'
import { nextTrack, trackOf } from './tutorial/tracks.ts'
import { AllPuzzlesPage } from './workshop/AllPuzzlesPage.tsx'
import { BuilderPage } from './workshop/BuilderPage.tsx'
import { PlaytestAlbum, PlaytestPuzzle } from './workshop/CampaignPlaytest.tsx'
import { openingCampaign } from './workshop/campaign-store.ts'
import { CrestPage } from './workshop/CrestPage.tsx'
import { WorkshopPage } from './workshop/WorkshopPage.tsx'
import { blankCampaignDoc, workshopSearch } from './workshop/workshop.ts'
import styles from './App.module.css'

function Root() {
  const { needsHandle } = useAccount()
  // Play, a Lesson and the puzzle editor carry the HUD's pills in their own rail or top line, or place the HUD themselves. Read from the
  // matches shown, not the address, which changes first: leaving Play, the HUD would mount over it before a morph
  // captures it, and its logo would hold still instead of slapping on.
  const playing = useRouterState({
    select: s =>
      /^\/(?:play\/|daily\/[^/]+\/[^/]+\/[^/]+|learn\/[^/]+\/[^/]+|workshop\/p\/|workshop\/c\/[^/]+\/playtest\/[^/]+\/[^/]+|make$)/.test(s.matches.at(-1)?.pathname ?? s.location.pathname),
  })
  // An edge state in their place wants the HUD back, floating like any Worlds page's.
  const edge = useRouterState({
    select: s => s.matches.some(m => m.status === 'error' || m.status === 'notFound' || m._notFound),
  })
  return (
    <PadProvider>
      <div className={styles.app}>
        {(!playing || edge) && <Hud float={edge || undefined} />}
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
  const [campaign] = await Promise.all([content.campaign(id), accountReady])
  if (!campaign) throw notFound()
  rememberCampaign(campaign)
  return campaign
}

/*
 * Retired player-made work stays open to players who started it. A signed-in account's own progress decides that
 * on the server; a signed-out device says so with `started`, from what it holds.
 */
const deviceStartedPuzzle = (id: string) => signedOutStorage.loadSolved(id) !== null || signedOutStorage.loadCells(id) !== null
const deviceStartedCampaign = (id: string) => startedCampaigns(signedOutStorage).has(id)

/**
 * The campaign a `/c` address names, official or player-made. A player-made one is never remembered for Home, but
 * opening it counts it started, so its puzzles open in its album from here on.
 */
async function loadAnyCampaign(id: string): Promise<Campaign | RetiredError> {
  const [campaign] = await Promise.all([content.anyCampaign(id, deviceStartedCampaign(id)), accountReady])
  if (!campaign) throw notFound()
  if (isRetired(campaign)) return campaign
  if (campaign.author === undefined) rememberCampaign(campaign)
  else markStarted(getAccount().storage, campaign.id)
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

async function loadCampaigns() {
  const campaigns = await content.campaigns()
  rememberCampaigns(campaigns)
  return campaigns
}

/** The signed-in player's profile, `null` signed out or if it fails to load. */
const loadOwnProfile = () =>
  accountReady.then(() => {
    const handle = getAccount().account?.handle
    return handle ? content.ownProfile(handle).catch(() => null) : null
  })

/** The signed-in player's Workshop, `null` signed out or if it fails to load. */
const loadOwnWorkshop = () =>
  accountReady.then(() => {
    const userId = getAccount().account?.userId
    return userId ? content.workshop(userId).catch(() => null) : null
  })

/**
 * The newest Featured campaign, for Home's column for it, unless the player has started it or it's the campaign Home
 * already holds. Not remembered: Home's Campaign column stays the last played.
 */
const loadFeatured = (campaigns: readonly CampaignSummary[], picked: string | null) =>
  accountReady.then(async () => {
    const { storage } = getAccount()
    const featured = newestFeatured(campaigns, startedCampaigns(storage), dayKey(new Date()))
    if (!featured || featured.id === picked) return null
    const campaign = await content.campaign(featured.id).catch(() => null)
    if (campaign) seedStarted(campaign, storage)
    return campaign
  })

const homeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: homeSearch,
  /**
   * The profile and Workshop are the signed-in player's, for the Profile, Settings and Workshop columns, and this
   * Year's Dailies are for the Daily column; Home stands without any of them, or without a Featured campaign.
   */
  loader: async () => {
    const campaigns = await loadCampaigns()
    const id = pickCampaign(campaigns)
    const [campaign, featured, dailyYear, profile, workshop] = await Promise.all([
      id === null ? null : loadCampaign(id),
      loadFeatured(campaigns, id),
      loadDailyYear(new Date().getFullYear()).catch(() => null),
      loadOwnProfile(),
      loadOwnWorkshop(),
    ])
    return { campaign, featured, dailyYear, profile, workshop }
  },
  component: () => {
    const { campaign, featured, dailyYear, profile, workshop } = homeRoute.useLoaderData()
    return campaign ? (
      <HomePage campaign={campaign} featured={featured} dailyYear={dailyYear} profile={profile} workshop={workshop} />
    ) : (
      <main className={styles.message}>No campaigns yet.</main>
    )
  },
  pendingComponent: HomeSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
})

/** Campaigns opens on the last campaign played, or the default. */
const campaignsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c',
  beforeLoad: async () => {
    const id = pickCampaign(await loadCampaigns())
    if (id === null) throw notFound()
    throw redirect({ to: '/c/$campaignId', params: { campaignId: id }, replace: true })
  },
})

/**
 * Every campaign in a row, this one open; the signed-in profile's campaigns count as started too. A player-made
 * campaign never joins the row: it stands alone.
 */
const campaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$campaignId',
  loader: async ({ params }) => {
    const [campaigns, campaign, profile] = await Promise.all([
      loadCampaigns(),
      loadAnyCampaign(params.campaignId),
      loadOwnProfile(),
    ])
    if (isRetired(campaign)) return { retired: campaign }
    return { campaigns: campaign.author === undefined ? campaigns : [], campaign, profile }
  },
  component: (): ReactNode => {
    const data = campaignRoute.useLoaderData()
    return 'retired' in data ? <Retired what="campaign" author={data.retired.author} /> : <CampaignsPage {...data} />
  },
  pendingComponent: CampaignsSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
  notFoundComponent: () => <NotFound>There’s no campaign by that name.</NotFound>,
})

const provinceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/c/$campaignId/$provinceId',
  validateSearch: unveilSearch,
  loader: async ({ params }) => {
    const campaign = await loadAnyCampaign(params.campaignId)
    if (isRetired(campaign)) return { retired: campaign }
    const province = campaign.provinces.find(p => p.id === params.provinceId)
    if (!province) throw notFound()
    return { campaign, province }
  },
  component: (): ReactNode => {
    const data = provinceRoute.useLoaderData()
    const conquest = provinceRoute.useSearch().conquest
    return 'retired' in data ? (
      <Retired what="campaign" author={data.retired.author} />
    ) : (
      <ProvincePage {...data} previewConquest={conquest} />
    )
  },
  pendingComponent: ProvinceSkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
  notFoundComponent: () => (
    <NotFound>There’s no province called “{provinceRoute.useParams().provinceId}”. It might have been renamed.</NotFound>
  ),
})

type PlayData =
  | { kind: 'official'; puzzle: Extract<PuzzleClues, { campaignId: string }>; campaign: Campaign }
  | { kind: 'made'; puzzle: Extract<PuzzleClues, { made: unknown }>; campaign: Campaign | null }
  | { kind: 'retired'; author: string }

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$id',
  /** Dev only: `?conquest` shows the after panel as if this solve had just conquered the province. */
  validateSearch: (search: Record<string, unknown>): { conquest?: true } =>
    import.meta.env.DEV && 'conquest' in search ? { conquest: true } : {},
  loader: async ({ params }): Promise<PlayData> => {
    const [puzzle] = await Promise.all([content.anyPuzzle(params.id, deviceStartedPuzzle(params.id)), accountReady])
    if (!puzzle || 'daily' in puzzle) throw notFound()
    if (isRetired(puzzle)) return { kind: 'retired', author: puzzle.author }
    if ('campaignId' in puzzle) return { kind: 'official', puzzle, campaign: await loadCampaign(puzzle.campaignId) }
    // Its album, if it has one and the player may see it; standalone otherwise.
    content.forgetWorkshop()
    const home = puzzle.made.campaign
    const campaign =
      home &&
      (await content
        .anyCampaign(home.id, deviceStartedCampaign(home.id) || deviceStartedPuzzle(params.id))
        .catch(() => null))
    return { kind: 'made', puzzle, campaign: campaign && !isRetired(campaign) ? campaign : null }
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
    const [puzzle] = await Promise.all([content.puzzle(dailyId(date)), accountReady])
    if (!puzzle || !('daily' in puzzle)) throw notFound()
    return { puzzle, date }
  },
  component: DailyPlayPage,
  pendingComponent: PlaySkeleton,
  get pendingMs() {
    return morphPendingMs()
  },
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
    const own = getAccount().account?.handle
    const ownOrOther =
      own?.toLowerCase() === params.handle.toLowerCase() ? content.ownProfile(own) : fetchProfile(params.handle)
    const [profile, campaigns] = await Promise.all([ownOrOther, content.campaigns()])
    if (!profile) throw notFound()
    // The switcher offers the campaigns the player has started, then their Years; a newcomer gets the default campaign.
    const started = campaigns.filter(c => profile.campaigns.some(pc => pc.id === c.id))
    const years = profile.years.flatMap(y => yearOfAlbum(y.id) ?? []).sort((a, b) => a - b)
    const tabs = [...started, ...years.map(y => ({ id: yearAlbumId(y), name: yearAlbumName(y) }))]
    const year = deps.c === undefined ? null : yearOfAlbum(deps.c)
    const dailyYear = year !== null && years.includes(year) ? await loadDailyYear(year) : null
    if (dailyYear) return { profile, album: yearAlbum(dailyYear), tabs }
    const id = started.find(c => c.id === deps.c)?.id ?? profile.campaigns[0]?.id ?? campaigns[0]?.id
    const campaign = id === undefined ? null : await content.campaign(id)
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
  get pendingMs() {
    return morphPendingMs()
  },
  notFoundComponent: () => <NotFound>There’s no lesson by that name.</NotFound>,
})

const signedInOnly = async () => {
  await accountReady
  if (!getAccount().account) throw redirect({ to: '/', replace: true })
}

/** The signed-in player's Workshop, with the Played campaign it opens on loaded for its column. */
const workshopRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workshop',
  validateSearch: workshopSearch,
  beforeLoad: signedInOnly,
  loaderDeps: ({ search }) => ({ tab: search.tab, open: search.open }),
  loader: async ({ deps }) => {
    const userId = getAccount().account!.userId
    const workshop = await content.workshop(userId)
    const played = deps.tab === 'played' ? workshop.played.campaigns.find(c => c.id === deps.open && !c.removed) : undefined
    const drafted = deps.tab === undefined ? workshop.drafts.campaigns.find(c => c.id === deps.open) : undefined
    const [campaign, draft] = await Promise.all([
      played ? content.anyCampaign(played.id, false).catch(() => null) : null,
      drafted ? openingCampaign({ userId, id: drafted.id }) : null,
    ])
    return { workshop, campaign: campaign && !isRetired(campaign) ? campaign : null, draft }
  },
  component: () => <WorkshopPage {...workshopRoute.useLoaderData()} />,
})

const workshopPuzzlesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workshop/puzzles',
  beforeLoad: signedInOnly,
  loader: async () => ({ workshop: await content.workshop(getAccount().account!.userId) }),
  component: () => <AllPuzzlesPage {...workshopPuzzlesRoute.useLoaderData()} />,
})

/** Starts a draft campaign and opens the Workshop on it. Never on a preload, which would leave a stray draft. */
const newCampaignRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workshop/new-campaign',
  beforeLoad: async ({ preload }) => {
    await signedInOnly()
    if (preload) return
    const id = newDraftId()
    await putDraftCampaign(id, { doc: blankCampaignDoc(), updatedAt: new Date().toISOString() })
    content.forgetWorkshop()
    throw redirect({ to: '/workshop', search: { open: id }, replace: true })
  },
})

/** A draft campaign of the signed-in player's, and their Workshop for the puzzles in it. */
async function loadDraftCampaign(id: string) {
  const userId = getAccount().account!.userId
  const draftKey = { userId, id }
  const [opening, workshop] = await Promise.all([openingCampaign(draftKey), content.workshop(userId)])
  if (!opening) throw notFound()
  return { draftKey, opening, workshop }
}

const noDraftCampaign = () => <NotFound>You have no draft campaign by that name.</NotFound>

const crestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workshop/c/$id/crest',
  beforeLoad: signedInOnly,
  loader: ({ params }) => loadDraftCampaign(params.id),
  component: () => {
    const { draftKey, opening } = crestRoute.useLoaderData()
    return <CrestPage key={draftKey.id} draftKey={draftKey} opening={opening} />
  },
  notFoundComponent: noDraftCampaign,
})

/** A draft campaign's provinces, `n` the one open, 1-based. */
const builderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workshop/c/$id/$n',
  beforeLoad: signedInOnly,
  loader: ({ params }) => loadDraftCampaign(params.id),
  component: () => {
    const data = builderRoute.useLoaderData()
    return <BuilderPage key={data.draftKey.id} {...data} n={Number(builderRoute.useParams().n) || 1} />
  },
  notFoundComponent: noDraftCampaign,
})

const playtestRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workshop/c/$id/playtest/$n',
  beforeLoad: signedInOnly,
  loader: ({ params }) => loadDraftCampaign(params.id),
  component: () => {
    const data = playtestRoute.useLoaderData()
    return <PlaytestAlbum key={data.draftKey.id} {...data} n={Number(playtestRoute.useParams().n) || 1} />
  },
  notFoundComponent: noDraftCampaign,
})

/** One puzzle of a campaign playtest, `slot` its 1-based place in province `n`. */
const playtestPuzzleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workshop/c/$id/playtest/$n/$slot',
  beforeLoad: signedInOnly,
  loader: async ({ params }) => {
    const data = await loadDraftCampaign(params.id)
    const ref = data.opening.doc.provinces[Number(params.n) - 1]?.puzzleIds[Number(params.slot) - 1]
    if (ref === undefined) throw notFound()
    const made = data.workshop.made.puzzles.find(p => p.id === ref)
    const picture: Draft | null = made
      ? {
          id: ref,
          title: made.title,
          width: made.width,
          height: made.height,
          cells: made.palette,
          colors: [...new Set(made.palette.filter(c => c !== null))],
        }
      : (await openingCopy({ userId: data.draftKey.userId, id: ref })).draft
    return { ...data, picture }
  },
  component: () => {
    const { n, slot } = playtestPuzzleRoute.useParams()
    return <PlaytestPuzzle key={`${n}:${slot}`} {...playtestPuzzleRoute.useLoaderData()} n={Number(n)} slot={Number(slot)} />
  },
  pendingComponent: PlaySkeleton,
  notFoundComponent: () => <NotFound>There’s no puzzle in that slot.</NotFound>,
})

/** Published ids are 10 of a–z 0–9 with a digit; draft ids have a `-`. */
const MADE_ID = /^(?=.*\d)[a-z0-9]{10}$/

type WorkshopPuzzleData =
  | { kind: 'draft'; draftKey: DraftKey; stored: StoredDraft }
  | { kind: 'published'; puzzle: MadePuzzleSummary }

/**
 * Signed in only, and its own chunk: the puzzle editor on a draft, which a new id starts blank, or one of the
 * Author's published puzzles.
 */
const workshopPuzzleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workshop/p/$id',
  beforeLoad: signedInOnly,
  loader: async ({ params }): Promise<WorkshopPuzzleData> => {
    const userId = getAccount().account!.userId
    if (!MADE_ID.test(params.id)) {
      const draftKey = { userId, id: params.id }
      return { kind: 'draft', draftKey, stored: await openingCopy(draftKey) }
    }
    const puzzle = (await fetchMade()).puzzles.find(p => p.id === params.id && !p.removed)
    if (!puzzle) throw notFound()
    return { kind: 'published', puzzle }
  },
  component: lazyRouteComponent(() => import('./make/WorkshopPuzzle.tsx'), 'WorkshopPuzzlePage'),
  pendingComponent: PlaySkeleton,
  notFoundComponent: () => <NotFound>You have no puzzle by that name.</NotFound>,
})

/** Dev only: the editor on a draft that stays on this device, for a campaign's data file. */
const devRoutes = import.meta.env.DEV
  ? [
      createRoute({
        getParentRoute: () => rootRoute,
        path: '/make',
        component: lazyRouteComponent(() => import('./make/MakePage.tsx'), 'DevMakePage'),
      }),
    ]
  : []

export const router = createRouter({
  routeTree: rootRoute.addChildren([
    homeRoute,
    campaignsRoute,
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
    workshopRoute,
    workshopPuzzlesRoute,
    newCampaignRoute,
    crestRoute,
    builderRoute,
    playtestRoute,
    playtestPuzzleRoute,
    workshopPuzzleRoute,
    ...devRoutes,
  ]),
  defaultErrorComponent: LoadError,
  defaultPendingComponent: Fallback,
  defaultPendingMs: PENDING_MS,
})

installMorphNavigation(router)

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
