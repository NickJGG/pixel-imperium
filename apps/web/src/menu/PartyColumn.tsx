import { type CSSProperties, type ReactNode, useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PARTY_SEATS, type PartyInvite, type PartySeat, type PartyState } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { SlotFace } from '../campaign/PuzzleSlot.tsx'
import { addFriend, useFriends } from '../friends/friends-store.ts'
import { PeopleIcon, PlayWithParty, SignInButtons, mayPlayWithParty, useAcceptInvite } from '../party/PartyCard.tsx'
import { party, usePartyView, usePlayOffer } from '../party/party-store.ts'
import { usePuzzlePlace } from '../party/puzzle-place.ts'
import { SEAT_NAMES, initialOf, seatColor, seatLabel } from '../party/seats.ts'
import type { PartyNotice, PartyView } from '../party/session.ts'
import { goToColumn } from './step.ts'
import styles from './Columns.module.css'

const dotStyle = (seat: number) => ({ '--seat': `var(${seatColor(seat)})` }) as CSSProperties

const NOTICE: Record<PartyNotice['kind'], string> = {
  host: 'You’re the Host now.',
  removed: 'The Host removed you from the party.',
  ended: 'Your party has ended.',
}

/**
 * The menu's Party column: what's waiting, what the Party is solving, its seats, its link, then the ways out.
 * Out of a Party, a way to start one; signed out and in none, sign-in. Invites stay here until answered, after their
 * slip has tucked away.
 */
export function PartyColumn() {
  const { account } = useAccount()
  const view = usePartyView()
  const offer = usePlayOffer()
  const current = view.party
  return (
    <section className={styles.column} aria-labelledby="party-column-title">
      <h2 id="party-column-title" className={styles.heading}>
        Party
        {current && (
          <small>
            {current.seats.length}/{PARTY_SEATS}
          </small>
        )}
      </h2>
      {view.notice && (
        <div className={styles.note} role="status">
          <span>{NOTICE[view.notice.kind]}</span>
          <button type="button" data-variant="flat" data-size="compact" onClick={() => party.dismissNotice()}>
            OK
          </button>
        </div>
      )}
      {view.invites.map(invite => (
        <Invite key={invite.id} invite={invite} inParty={current !== null} />
      ))}
      {current ? (
        <Live view={view} current={current} offer={offer} />
      ) : account ? (
        <>
          <p className={styles.blurb}>Solve puzzles together, up to four of you. Invite friends, or share the party’s link with anyone.</p>
          <div className={styles.actions}>
            <button type="button" data-size="compact" disabled={view.status !== 'live'} onClick={() => party.startParty()}>
              Start a party
            </button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.blurb}>
            Solve puzzles together, up to four of you. Sign in to start a party. Friends can join yours without an account.
          </p>
          <div className={styles.actions}>
            <SignInButtons variant="paper" />
          </div>
        </>
      )}
      {!current && offer && (
        <div className={styles.actions}>
          <PlayWithParty puzzleId={offer} size="compact" />
        </div>
      )}
    </section>
  )
}

function Invite({ invite, inParty }: { invite: PartyInvite; inParty: boolean }) {
  const accept = useAcceptInvite()
  return (
    <div className={styles.note}>
      <span>
        <b>@{invite.from}</b> invited you to {invite.from === invite.host ? 'their' : `@${invite.host}’s`} party
        {invite.puzzle && `, solving ${invite.puzzle.title}`} · {invite.size}/{PARTY_SEATS}
        {inParty && <small>You’ll leave this party</small>}
      </span>
      <button type="button" data-size="compact" onClick={() => accept(invite)}>
        Join
      </button>
      <button type="button" data-variant="flat" data-size="compact" onClick={() => party.respond(invite.id, false)}>
        Decline
      </button>
    </div>
  )
}

function Live({ view, current, offer }: { view: PartyView; current: PartyState; offer: string | null }) {
  const host = view.you === current.host
  return (
    <>
      <Now view={view} current={current} offer={host && offer && mayPlayWithParty(view, offer) ? offer : null} />
      <ul className={styles.seats}>
        {Array.from({ length: PARTY_SEATS }, (_, n) => {
          const s = current.seats.find(seat => seat.seat === n)
          return s ? (
            <Seat key={n} seat={s} view={view} current={current} />
          ) : (
            <li key={n}>
              <button type="button" className={styles.open} data-variant="flat" onClick={() => goToColumn('friends')}>
                <span className={styles.seatDot} aria-hidden="true" />
                <span className={styles.who}>
                  Open seat
                  <small>Invite a friend from Friends</small>
                </span>
              </button>
            </li>
          )
        })}
      </ul>
      <Share host={host} code={current.code} />
      <Exits host={host} />
    </>
  )
}

/**
 * The Party's puzzle, always as a tinted block. `offer` is the Host's own puzzle when it isn't the Party's: then the
 * Party's sits over it, with a way to bring the Party along.
 */
function Now({ view, current, offer }: { view: PartyView; current: PartyState; offer: string | null }) {
  const puzzle = current.puzzle
  const join = (id: string) => (
    <Link to="/play/$id" params={{ id }} data-variant="paper" data-size="compact">
      Join
    </Link>
  )
  if (offer) {
    return (
      <div className={styles.now}>
        {puzzle ? (
          <PuzzleRow id={puzzle.id} title={puzzle.title} label="Party">
            {join(puzzle.id)}
          </PuzzleRow>
        ) : (
          <EmptyRow>
            <small>Party</small>
            <span>No puzzle yet</span>
          </EmptyRow>
        )}
        <span className={styles.arrow} aria-hidden="true">
          ↑
        </span>
        <Offer puzzleId={offer} />
      </div>
    )
  }
  if (view.started) {
    return (
      <div className={styles.now}>
        <PuzzleRow id={view.started.puzzleId} title={view.started.title}>
          {join(view.started.puzzleId)}
          <button type="button" data-variant="flat" data-size="compact" onClick={() => party.dismissStarted()}>
            Later
          </button>
        </PuzzleRow>
      </div>
    )
  }
  if (puzzle) {
    return (
      <div className={styles.now}>
        <PuzzleRow id={puzzle.id} title={puzzle.title} where>
          {view.grid !== puzzle.id && join(puzzle.id)}
        </PuzzleRow>
      </div>
    )
  }
  const hostSeat = current.seats.find(s => s.seat === current.host)
  return (
    <div className={styles.now}>
      <EmptyRow>
        {view.you === current.host ? (
          <span>
            Open any puzzle and press <b>Play with party</b>.
          </span>
        ) : (
          <span>Waiting for {hostSeat ? seatLabel(hostSeat) : 'the Host'} to pick a puzzle.</span>
        )}
      </EmptyRow>
    </div>
  )
}

function Offer({ puzzleId }: { puzzleId: string }) {
  const place = usePuzzlePlace(puzzleId)
  return (
    <>
      <PuzzleRow id={puzzleId} label="You" />
      <div className={`${styles.actions} ${styles.wide}`}>
        <PlayWithParty
          puzzleId={puzzleId}
          size="compact"
          label={place ? `Play ${place.puzzle.title} with party` : 'Play with party'}
        />
      </div>
    </>
  )
}

interface PuzzleRowProps {
  id: string
  /** Until the puzzle's place loads, or in place of its own. */
  title?: string
  label?: string
  where?: boolean
  children?: ReactNode
}

function PuzzleRow({ id, title, label, where, children }: PuzzleRowProps) {
  const place = usePuzzlePlace(id)
  const { storage } = useAccount()
  return (
    <div className={styles.nowRow}>
      <span className={styles.thumb} aria-hidden="true">
        {place && <SlotFace puzzle={place.puzzle} number={place.number ?? 0} storage={storage} />}
      </span>
      <span className={styles.nowText}>
        {label && <small>{label}</small>}
        <b>
          {place?.number && `#${place.number} `}
          {title ?? place?.puzzle.title}
        </b>
        {where && place?.where && <small>{place.where}</small>}
      </span>
      {children && <span className={styles.nowButtons}>{children}</span>}
    </div>
  )
}

function EmptyRow({ children }: { children: ReactNode }) {
  return (
    <div className={styles.nowRow}>
      <span className={styles.thumb} aria-hidden="true" />
      <span className={styles.nowText}>{children}</span>
    </div>
  )
}

function Share({ host, code }: { host: boolean; code: string }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])
  const copy = () =>
    navigator.clipboard.writeText(`${location.protocol}//${location.host}/party/${code}`).then(
      () => setCopied(true),
      () => {},
    )
  return (
    <div className={styles.actions}>
      <button type="button" data-size="compact" title={`${location.host}/party/${code}`} onClick={() => void copy()}>
        <LinkIcon />
        {copied ? 'Copied' : 'Copy link'}
      </button>
      {host && (
        <button
          type="button"
          data-variant="flat"
          data-size="compact"
          title="The old link stops working; everyone already in stays"
          onClick={() => party.newLink()}
        >
          New link
        </button>
      )}
    </div>
  )
}

function Exits({ host }: { host: boolean }) {
  const [ending, setEnding] = useState(false)
  if (ending) {
    return (
      <div className={`${styles.actions} ${styles.foot}`} role="group" aria-label="End party">
        <button type="button" data-variant="danger" data-size="compact" onClick={() => party.end()}>
          End for everyone
        </button>
        <button type="button" data-variant="flat" data-size="compact" onClick={() => setEnding(false)}>
          Cancel
        </button>
      </div>
    )
  }
  return (
    <div className={`${styles.actions} ${styles.foot}`}>
      {host && (
        <button type="button" data-variant="flat" data-size="compact" onClick={() => setEnding(true)}>
          End party
        </button>
      )}
      <button type="button" data-variant="flat" data-size="compact" onClick={() => party.leave()}>
        {host ? 'Leave' : 'Leave party'}
      </button>
    </div>
  )
}

function Seat({ seat: s, view, current }: { seat: PartySeat; view: PartyView; current: PartyState }) {
  const n = s.seat
  const host = view.you === current.host
  const name = seatLabel(s)
  const puzzle = current.puzzle
  const where = !s.connected ? 'Offline' : puzzle ? (s.here ? `On ${puzzle.title}` : 'Away') : ''
  const who = [n === current.host && 'Host', n === view.you && 'you', !s.account && 'joined by link'].filter(Boolean).join(' · ')
  return (
    <li className={styles.seat} data-off={!s.connected || undefined}>
      <span className={styles.seatDot} style={dotStyle(n)} data-away={(puzzle && !s.here) || undefined} aria-hidden="true">
        {initialOf(s.name)}
      </span>
      <span className={styles.who}>
        <span>
          <span className={styles.srOnly}>{SEAT_NAMES[n]}: </span>
          {name}
        </span>
        {(who || where) && <small>{[who, where].filter(Boolean).join(' · ')}</small>}
      </span>
      {n !== view.you && s.account && <AddFriend handle={s.name} />}
      {host && n !== current.host && s.account && (
        <button type="button" data-variant="flat" data-size="compact" onClick={() => party.makeHost(n)}>
          Make Host
        </button>
      )}
      {host && n !== current.host && (
        <button
          type="button"
          className={styles.x}
          data-variant="flat"
          data-size="compact"
          aria-label={`Remove ${name}`}
          title={`Remove ${name}`}
          onClick={() => party.remove(n)}
        >
          ×
        </button>
      )}
    </li>
  )
}

/** For a signed-in player seated beside this one who isn't yet a friend, nor already asked. */
function AddFriend({ handle }: { handle: string }) {
  const { account } = useAccount()
  const friends = useFriends()
  const [asked, setAsked] = useState(false)
  if (!account || !friends) return null
  const same = (p: { handle: string }) => p.handle.toLowerCase() === handle.toLowerCase()
  if (friends.friends.some(same) || friends.incoming.some(same)) return null
  if (asked || friends.outgoing.some(same)) return <small className={styles.tag}>Request sent</small>
  return (
    <button
      type="button"
      data-variant="flat"
      data-size="compact"
      title={`Send @${handle} a friend request`}
      onClick={() => {
        setAsked(true)
        addFriend(handle).catch(() => setAsked(false))
      }}
    >
      <PeopleIcon />
      Add friend
    </button>
  )
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </svg>
  )
}
