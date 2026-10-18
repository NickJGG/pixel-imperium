import { type CSSProperties, useEffect, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { PartyInvite, PartySeat } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { PROVIDERS, signIn } from '../auth.ts'
import { party, usePartyView } from './party-store.ts'
import { initialOf, seatColor } from './seats.ts'
import type { PartyView } from './session.ts'
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

/** Takes the seat, and goes to the Party's puzzle when it's on one. */
export function useAcceptInvite(): (invite: PartyInvite) => void {
  const navigate = useNavigate()
  return invite => {
    party.respond(invite.id, true)
    if (invite.puzzle) void navigate({ to: '/play/$id', params: { id: invite.puzzle.id } })
  }
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
