import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, getRouteApi, useNavigate } from '@tanstack/react-router'
import type { Campaign, PartyInfo, PartyRefusal, PuzzleClues } from '@pixel-imperium/protocol'
import { type AccountState, useAccount } from '../account.ts'
import { paperFor } from '../album/paper.ts'
import { isRetired } from '../api.ts'
import * as content from '../content.ts'
import { EdgeState, Retired } from '../EdgeStates.tsx'
import { Hud } from '../Hud.tsx'
import { openMenuOn } from '../menu/menu-store.ts'
import { type PlayContext, Play, TIER_NAME } from '../play/PlayPage.tsx'
import { PlaySkeleton } from '../play/PlaySkeleton.tsx'
import { PlaytestStorage } from '../play/playtest-storage.ts'
import { useHudTrail } from '../Trail.tsx'
import { partyTrail } from '../trails.ts'
import { JoinCard, type JoinInfo } from './JoinCard.tsx'
import { joinParty, usePartyView } from './party-store.ts'
import styles from './Party.module.css'

const route = getRouteApi('/party/$code')

export interface PartyPuzzle {
  puzzle: PuzzleClues
  /** An official puzzle's campaign, for its Province's paper. */
  campaign: Campaign | null
}

/** The Party's puzzle, for the join card's preview; `null` when there's none this player may open. */
export async function loadPartyPuzzle(id: string, started: boolean): Promise<PartyPuzzle | null> {
  const puzzle = await content.anyPuzzle(id, started)
  if (!puzzle || isRetired(puzzle) || 'daily' in puzzle) return null
  const campaign = 'campaignId' in puzzle ? await content.campaign(puzzle.campaignId) : null
  return { puzzle, campaign }
}

function previewContext({ puzzle, campaign }: PartyPuzzle, code: string): PlayContext {
  const here = `/party/${code}`
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
      trail: partyTrail(code, { title: puzzle.title, paper: province.paper }, { campaign, province }),
    }
  }
  const paper = 'made' in puzzle ? (puzzle.made.paper ?? 'workshop') : 'workshop'
  return {
    place: 'Home',
    paper: paperFor(paper),
    back: '/',
    here,
    meta: size,
    trail: partyTrail(code, { title: puzzle.title, paper }, null),
    ...('made' in puzzle && { byline: puzzle.made.author }),
  }
}

/**
 * A Party by its link. A player already seated goes straight back in; anyone else sees the join card first, over the
 * Party's puzzle when it has one, or why the link won't let them in. Joining lands on the Party's puzzle, else Home.
 */
export function PartyPage() {
  const { info, first, started } = route.useLoaderData()
  const { code } = route.useParams()
  const account = useAccount()
  const view = usePartyView()
  const [joined, setJoined] = useState(false)
  if (info.access === 'ended' || info.access === 'retired-closed') return <PartyClosed info={info} />
  if (info.access === 'join' && (info.seated || joined)) return <Joining code={code} started={started} puzzleId={info.puzzle?.id ?? null} />

  const current = view.party
  const host = current?.seats.find(s => s.seat === current.host)
  const leaving = !current || current.code === code ? null : view.you === current.host ? 'you' : (host?.name ?? null)
  const card = <JoinCard info={info} signedIn={account.account !== null} leaving={leaving} onJoin={() => setJoined(true)} />
  return first ? (
    <JoinPreview key={`${account.generation}:${first.puzzle.id}`} first={first} code={code} account={account}>
      {card}
    </JoinPreview>
  ) : (
    <JoinBare info={info} code={code}>
      {card}
    </JoinBare>
  )
}

/** The Party's puzzle, empty and asleep, under the join card. */
function JoinPreview({ first, code, account, children }: { first: PartyPuzzle; code: string; account: AccountState; children: ReactNode }) {
  const [storage] = useState(() => new PlaytestStorage())
  return (
    <Play puzzle={first.puzzle} context={previewContext(first, code)} account={{ ...account, storage, sync: null }} cover={children} />
  )
}

/** A Party with no puzzle yet: the join card on the Party's own paper. */
function JoinBare({ info, code, children }: { info: JoinInfo; code: string; children: ReactNode }) {
  useHudTrail(partyTrail(code, null, null))
  return (
    <>
      <Hud float />
      <main className={styles.bare} style={paperFor('throne')} aria-label={`@${info.host}’s party`}>
        {children}
      </main>
    </>
  )
}

/** Asks for the seat, then goes where the Party is: its puzzle, or Home with the menu open on Party. */
function Joining({ code, started, puzzleId: linked }: { code: string; started: boolean; puzzleId: string | null }) {
  const view = usePartyView()
  const navigate = useNavigate()
  const asked = useRef(false)
  useEffect(() => {
    asked.current = true
    joinParty(code, started)
  }, [code, started])
  const puzzleId = view.party?.puzzle?.id
  const landed = asked.current && !view.joining && view.party !== null
  useEffect(() => {
    if (!landed) return
    if (puzzleId) return void navigate({ to: '/play/$id', params: { id: puzzleId }, replace: true })
    openMenuOn('/', 'party')
    void navigate({ to: '/', replace: true })
  }, [landed, puzzleId, navigate])

  if (view.status === 'outdated') return <PartyOver status="outdated" puzzleId={null} />
  if (asked.current && !view.joining && view.refused) return <PartyOver status={view.refused} puzzleId={linked} />
  return <PlaySkeleton />
}

function PartyClosed({ info }: { info: PartyInfo }) {
  useHudTrail(partyTrail(route.useParams().code, null, null))
  if (info.access === 'retired-closed' && info.author) {
    return (
      <>
        <Hud float />
        <Retired what="puzzle" author={info.author} />
      </>
    )
  }
  return <PartyOver status={info.access === 'retired-closed' ? 'retired-closed' : 'ended'} puzzleId={null} />
}

const OVER: Record<PartyRefusal | 'outdated', { title: string; body: string }> = {
  ended: { title: 'This party has ended', body: 'The Host ended it, or everyone had left for a while.' },
  'not-found': { title: 'This party has ended', body: 'The Host ended it, or everyone had left for a while.' },
  full: { title: 'This party is full', body: 'Four players are already in.' },
  removed: { title: 'You’re no longer in this party', body: 'The Host removed you from it.' },
  'retired-closed': { title: 'This party can’t be joined', body: 'Its puzzle has been retired.' },
  outdated: { title: 'Pixel Imperium has been updated', body: 'Reload to keep playing together.' },
}

function PartyOver({ status, puzzleId }: { status: keyof typeof OVER; puzzleId: string | null }) {
  const { title, body } = OVER[status]
  useHudTrail(partyTrail(route.useParams().code, null, null))
  return (
    <>
      <Hud float />
      <EdgeState
        paper="throne"
        kicker="Party"
        title={title}
        mark={status === 'outdated' ? '↻' : '✕'}
        actions={
          status === 'outdated' ? (
            <button type="button" data-variant="primary" data-pad-default onClick={() => location.reload()}>
              Reload
            </button>
          ) : puzzleId ? (
            <Link to="/play/$id" params={{ id: puzzleId }} data-variant="primary" data-pad-default>
              Play it solo
            </Link>
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
