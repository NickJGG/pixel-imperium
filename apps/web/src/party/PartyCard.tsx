import { type CSSProperties, useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { PARTY_SEATS, type PartyInvite, type PartySeat } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { PROVIDERS, signIn } from '../auth.ts'
import { party, usePartyView } from './party-store.ts'
import { SEAT_NAMES, initialOf, seatColor, seatLabel } from './seats.ts'
import type { PartyNotice, PartyView } from './session.ts'
import styles from './Party.module.css'

const dotStyle = (seat: number) => ({ '--seat': `var(${seatColor(seat)})` }) as CSSProperties

/** Each player as a dot in their seat color with their initial; a player who's away shows faded. */
export function Faces({ seats }: { seats: readonly PartySeat[] }) {
  return (
    <span className={styles.faces} aria-hidden="true">
      {seats.map(s => (
        <span key={s.seat} className={styles.dot} style={dotStyle(s.seat)} data-away={!s.connected || undefined}>
          {initialOf(s.name)}
        </span>
      ))}
    </span>
  )
}

/** Whether Play with party belongs on `puzzleId`'s page: not while the Party is on it, nor for a guest of the Host. */
export function mayPlayWithParty(view: PartyView, puzzleId: string): boolean {
  return view.party === null || (view.you === view.party.host && view.party.puzzle?.id !== puzzleId)
}

interface PlayProps {
  puzzleId: string
  className?: string | undefined
  variant?: 'primary' | 'flat' | undefined
  size?: 'compact' | undefined
}

/**
 * The Host's (or, in no Party, anyone's): the Party solves this puzzle next, from the Host's own grid, which is why
 * this device's latest goes to the server first. Signed out, it asks for sign-in.
 */
export function PlayWithParty({ puzzleId, className, variant = 'primary', size }: PlayProps) {
  const { account, sync } = useAccount()
  const view = usePartyView()
  const [starting, setStarting] = useState(false)
  const onIt = view.party?.puzzle?.id === puzzleId
  useEffect(() => {
    if (!starting) return
    const timer = setTimeout(() => setStarting(false), 5000)
    return () => clearTimeout(timer)
  }, [starting])
  useEffect(() => setStarting(false), [onIt])
  if (!mayPlayWithParty(view, puzzleId)) return null
  if (!account) {
    return (
      <Link to="/" search={{ open: 'signin' }} className={className} data-variant={variant} data-size={size}>
        <PeopleIcon />
        Play with party
      </Link>
    )
  }
  const start = async () => {
    setStarting(true)
    await sync?.flush().catch(() => {})
    party.play(puzzleId)
  }
  return (
    <button
      type="button"
      className={className}
      data-variant={variant}
      data-size={size}
      disabled={starting || view.status !== 'live'}
      onClick={() => void start()}
    >
      <PeopleIcon />
      Play with party
    </button>
  )
}

/**
 * Until the menu's Party column: what the Party pill's card held, in the menu the party sticker opens. Who's in the
 * Party and the Host's tools, waiting invites, and a way back to the Party's puzzle; `puzzleId` is the page's, for
 * the Play with party a phone has nowhere else.
 */
export function PartyDetails({ puzzleId }: { puzzleId: string | null }) {
  const view = usePartyView()
  const { party: current } = view
  return (
    <div className={`${styles.card} ${styles.details}`} data-surface="paper">
      {view.notice && <Notice notice={view.notice} />}
      {view.invites.map(invite => (
        <InviteRow key={invite.id} invite={invite} inParty={current !== null} />
      ))}
      {current ? <LiveCard view={view} /> : <StartCard />}
      {puzzleId && <PlayWithParty puzzleId={puzzleId} size="compact" />}
    </div>
  )
}

const NOTICE: Record<PartyNotice['kind'], string> = {
  host: 'You’re the Host now.',
  removed: 'The Host removed you from the party.',
  ended: 'Your party has ended.',
}

function Notice({ notice }: { notice: PartyNotice }) {
  return (
    <div className={styles.row} role="status">
      <p>{NOTICE[notice.kind]}</p>
      <button type="button" data-variant="flat" data-size="compact" onClick={() => party.dismissNotice()}>
        OK
      </button>
    </div>
  )
}

/** Takes the seat, and goes to the Party's puzzle when it's on one. */
export function useAcceptInvite(): (invite: PartyInvite) => void {
  const navigate = useNavigate()
  return invite => {
    party.respond(invite.id, true)
    if (invite.puzzle) void navigate({ to: '/play/$id', params: { id: invite.puzzle.id } })
  }
}

function InviteRow({ invite, inParty }: { invite: PartyInvite; inParty: boolean }) {
  const accept = useAcceptInvite()
  return (
    <>
      <p>
        @{invite.from} invited you to {invite.from === invite.host ? 'their' : `@${invite.host}’s`} party
        {invite.puzzle && `, solving ${invite.puzzle.title}`} · {invite.size}/{PARTY_SEATS}.
        {inParty && ' You’ll leave your party.'}
      </p>
      <div className={styles.row}>
        <button type="button" data-variant="primary" data-size="compact" onClick={() => accept(invite)}>
          Join
        </button>
        <button type="button" data-variant="paper" data-size="compact" onClick={() => party.respond(invite.id, false)}>
          Decline
        </button>
      </div>
    </>
  )
}

function StartCard() {
  const { account } = useAccount()
  const view = usePartyView()
  if (!account) {
    return (
      <>
        <h2>Party</h2>
        <p>Sign in to start a party. Friends can join yours without an account.</p>
        <SignInButtons />
      </>
    )
  }
  return (
    <>
      <h2>Party</h2>
      <p>Solve puzzles together, up to four on one grid. Party stickers are never foil.</p>
      <button
        type="button"
        data-variant="primary"
        data-size="compact"
        disabled={view.status !== 'live'}
        onClick={() => party.startParty()}
      >
        Start a party
      </button>
    </>
  )
}

export function SignInButtons({ variant = 'primary' }: { variant?: 'primary' | 'paper' }) {
  return PROVIDERS.map(p => (
    <button
      key={p.id}
      type="button"
      data-variant={variant}
      data-size="compact"
      onClick={() => void signIn.social({ provider: p.id, callbackURL: window.location.href })}
    >
      Sign in with {p.label}
    </button>
  ))
}

function LiveCard({ view }: { view: PartyView }) {
  const current = view.party!
  const host = view.you === current.host
  const [copied, setCopied] = useState(false)
  const [ending, setEnding] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const link = `${location.host}/party/${current.code}`
  const copy = () =>
    navigator.clipboard.writeText(`${location.protocol}//${link}`).then(
      () => setCopied(true),
      () => {},
    )
  const { puzzle } = current
  const invitable = view.friends.filter(f => f.online && f.party === null)

  return (
    <>
      <h2>
        Party {current.seats.length}/{PARTY_SEATS}
      </h2>
      {view.started ? (
        <div className={styles.row}>
          <p>
            @{view.started.by} started {view.started.title}.
          </p>
          <Link to="/play/$id" params={{ id: view.started.puzzleId }} data-variant="primary" data-size="compact">
            Join
          </Link>
          <button type="button" data-variant="paper" data-size="compact" onClick={() => party.dismissStarted()}>
            Later
          </button>
        </div>
      ) : puzzle ? (
        view.grid === puzzle.id ? (
          <p>Solving {puzzle.title}.</p>
        ) : (
          <Link to="/play/$id" params={{ id: puzzle.id }} data-variant="primary" data-size="compact">
            Back to {puzzle.title}
          </Link>
        )
      ) : (
        <p>
          {host
            ? 'Open any puzzle and press Play with party.'
            : `Waiting for ${seatLabel(current.seats.find(s => s.seat === current.host) ?? { name: 'the Host', account: false })} to pick a puzzle.`}
        </p>
      )}
      <div className={styles.link}>
        <code>{link}</code>
        <button type="button" data-variant="primary" data-size="compact" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <ul className={styles.seats}>
        {Array.from({ length: PARTY_SEATS }, (_, n) => {
          const s = current.seats.find(seat => seat.seat === n)
          if (!s) {
            return (
              <li key={n} className={styles.empty}>
                <span className={styles.dot} aria-hidden="true" />
                Open seat
              </li>
            )
          }
          const name = seatLabel(s)
          const where = !s.connected ? 'Offline' : puzzle && !s.here ? 'Away' : ''
          return (
            <li key={n}>
              <span className={styles.dot} style={dotStyle(n)} data-away={!s.connected || undefined} aria-hidden="true">
                {initialOf(s.name)}
              </span>
              <span className={styles.srOnly}>{SEAT_NAMES[n]}: </span>
              {name}
              {n === view.you && <span className={styles.you}>(you)</span>}
              <small>{[n === current.host && 'Host', where].filter(Boolean).join(' · ')}</small>
              {host && n !== current.host && s.account && (
                <button type="button" data-variant="ghost" data-size="compact" onClick={() => party.makeHost(n)}>
                  Make Host
                </button>
              )}
              {host && n !== current.host && (
                <button
                  type="button"
                  className={styles.remove}
                  data-variant="ghost"
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
        })}
      </ul>
      {invitable.length > 0 && current.seats.length < PARTY_SEATS && (
        <ul className={styles.seats} aria-label="Invite a friend">
          {invitable.map(f => (
            <li key={f.handle}>
              @{f.handle}
              <button type="button" data-variant="flat" data-size="compact" onClick={() => party.invite(f.handle)}>
                Invite
              </button>
            </li>
          ))}
        </ul>
      )}
      {host && ending ? (
        <div className={styles.row} role="group" aria-label="End party">
          <button type="button" data-variant="danger" data-size="compact" onClick={() => party.end()}>
            End for everyone
          </button>
          <button type="button" data-variant="paper" data-size="compact" onClick={() => setEnding(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className={styles.row}>
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
          {host && (
            <button type="button" data-variant="flat" data-size="compact" onClick={() => setEnding(true)}>
              End party
            </button>
          )}
          <button type="button" data-variant="flat" data-size="compact" onClick={() => party.leave()}>
            Leave party
          </button>
        </div>
      )}
    </>
  )
}

export function PeopleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <circle cx="17" cy="9" r="2.8" />
      <path d="M16.5 14.2A5.5 5.5 0 0 1 21.5 20" />
    </svg>
  )
}
