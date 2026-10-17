import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import type { Campaign, CoopRoomInfo, PuzzleClues } from '@pixel-imperium/protocol'
import { type AccountState, useAccount } from '../account.ts'
import { paperFor } from '../album/paper.ts'
import { isRetired } from '../api.ts'
import * as content from '../content.ts'
import { EdgeState, Retired } from '../EdgeStates.tsx'
import { Hud } from '../Hud.tsx'
import { type PlayContext, Play, TIER_NAME } from '../play/PlayPage.tsx'
import { PlaySkeleton } from '../play/PlaySkeleton.tsx'
import { CoopStorage } from './coop-storage.ts'
import { deviceToken } from './device.ts'
import { type CoopStatus, CoopSession, isEnd } from './session.ts'

const route = getRouteApi('/co/$code')

export interface CoopPuzzle {
  puzzle: PuzzleClues
  /** An official puzzle's campaign, for its Province's paper and the way back. */
  campaign: Campaign | null
}

/** The co-op's puzzle; `null` when there's none this player may open. */
export async function loadCoopPuzzle(id: string, started: boolean): Promise<CoopPuzzle | null> {
  const puzzle = await content.anyPuzzle(id, started)
  if (!puzzle || isRetired(puzzle) || 'daily' in puzzle) return null
  const campaign = 'campaignId' in puzzle ? await content.campaign(puzzle.campaignId) : null
  return { puzzle, campaign }
}

function coopContext({ puzzle, campaign }: CoopPuzzle, code: string): PlayContext {
  const here = `/co/${code}`
  const size = `${puzzle.width}×${puzzle.height}`
  const province = 'provinceId' in puzzle ? campaign?.provinces.find(p => p.id === puzzle.provinceId) : undefined
  if (campaign && province) {
    return {
      place: province.name,
      paper: paperFor(province.paper),
      back: `/c/${campaign.id}/${province.id}`,
      here,
      meta: ['tier' in puzzle && puzzle.tier && TIER_NAME[puzzle.tier], size].filter(Boolean).join(' · '),
      campaign,
    }
  }
  return {
    place: 'Home',
    paper: paperFor('made' in puzzle ? (puzzle.made.paper ?? 'workshop') : 'workshop'),
    back: '/',
    here,
    meta: size,
    ...('made' in puzzle && { byline: puzzle.made.author }),
  }
}

/** A co-op by its link: joined at once when the link lets this player in, else why not. */
export function CoopPage() {
  const { info, first, started } = route.useLoaderData()
  const { code } = route.useParams()
  const account = useAccount()
  if (info.access !== 'join' || !first) return <CoopClosed info={info} />
  return <CoopPlay key={`${account.generation}:${code}`} code={code} first={first} started={started} account={account} />
}

function CoopPlay({
  code,
  first,
  started,
  account,
}: {
  code: string
  first: CoopPuzzle
  started: boolean
  account: AccountState
}) {
  const [session] = useState(() => new CoopSession(code, { deviceToken: deviceToken(), started }))
  useEffect(() => {
    session.start()
    return () => session.stop()
  }, [session])
  const view = useSyncExternalStore(session.subscribe, session.getState)
  const puzzleId = view.room?.puzzleId
  const [shown, setShown] = useState(first)
  useEffect(() => {
    if (puzzleId === undefined || puzzleId === shown.puzzle.id) return
    let live = true
    loadCoopPuzzle(puzzleId, false).then(
      p => live && p && setShown(p),
      () => {},
    )
    return () => {
      live = false
    }
  }, [puzzleId, shown.puzzle.id])

  const { puzzle } = shown
  const own = 'made' in puzzle && account.account?.handle.toLowerCase() === puzzle.made.author.toLowerCase()
  const userId = account.storage.userId
  const storage = useMemo(() => new CoopStorage(userId, () => session.grid(), own), [userId, session, own])

  if (isEnd(view.status)) return <CoopOver status={view.status} puzzleId={puzzleId ?? puzzle.id} />
  if (!view.room || puzzleId !== puzzle.id) return <PlaySkeleton />
  return (
    <Play
      key={puzzle.id}
      puzzle={puzzle}
      context={coopContext(shown, code)}
      account={{ ...account, storage, sync: null }}
      coop={session}
    />
  )
}

function PlaySolo({ puzzleId }: { puzzleId: string }) {
  return (
    <>
      <Link to="/play/$id" params={{ id: puzzleId }} data-variant="primary" data-pad-default>
        Play it solo
      </Link>
      <Link to="/" data-variant="paper">
        Back home
      </Link>
    </>
  )
}

function CoopClosed({ info }: { info: CoopRoomInfo }) {
  if (info.access === 'retired-closed' && info.author) {
    return (
      <>
        <Hud float />
        <Retired what="puzzle" author={info.author} />
      </>
    )
  }
  const solo = 'puzzleId' in info ? info.puzzleId : null
  return <CoopOver status={info.access === 'join' || info.access === 'retired-closed' ? 'not-allowed' : info.access} puzzleId={solo} />
}

const OVER: Record<Exclude<CoopStatus, 'connecting' | 'live' | 'reconnecting'>, { title: string; body: string }> = {
  ended: { title: 'This co-op has ended', body: 'The Host ended it, or everyone had left for a while.' },
  full: { title: 'This co-op is full', body: 'Four players are already in.' },
  removed: { title: 'You’re no longer in this co-op', body: 'The Host removed you from it.' },
  'not-allowed': { title: 'This co-op can’t be joined', body: 'The link may have been replaced by a new one.' },
  outdated: { title: 'Pixel Imperium has been updated', body: 'Reload to keep playing together.' },
}

function CoopOver({ status, puzzleId }: { status: keyof typeof OVER; puzzleId: string | null }) {
  const { title, body } = OVER[status]
  return (
    <>
      <Hud float />
      <EdgeState
        paper="workshop"
        kicker="Co-op"
        title={title}
        mark={status === 'outdated' ? '↻' : '✕'}
        actions={
          status === 'outdated' ? (
            <button type="button" data-variant="primary" data-pad-default onClick={() => location.reload()}>
              Reload
            </button>
          ) : puzzleId ? (
            <PlaySolo puzzleId={puzzleId} />
          ) : (
            <Link to="/" data-variant="primary" data-pad-default>
              Back home
            </Link>
          )
        }
      >
        <p>{body}</p>
      </EdgeState>
    </>
  )
}
