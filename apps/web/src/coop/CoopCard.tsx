import { type CSSProperties, useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import { COOP_SEATS, type CoopSeat } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { Menu } from '../AccountMenu.tsx'
import { createCoop } from '../api.ts'
import { PROVIDERS, signIn } from '../auth.ts'
import { backLink } from '../tutorial/handoff.ts'
import { SEAT_NAMES, initialOf, seatColor, seatLabel } from './seats.ts'
import type { CoopSession, CoopView } from './session.ts'
import styles from './Coop.module.css'

const NOOP_SUBSCRIBE = () => () => {}
const NO_VIEW = () => null

/** The co-op's view, or `null` outside one. */
export function useCoopView(session: CoopSession | undefined): CoopView | null {
  return useSyncExternalStore(session?.subscribe ?? NOOP_SUBSCRIBE, session?.getState ?? NO_VIEW)
}

const dotStyle = (seat: number) => ({ '--seat': `var(${seatColor(seat)})` }) as CSSProperties

/** Each player as a dot in their seat color with their initial; a player who's away shows faded. */
export function Faces({ seats }: { seats: readonly CoopSeat[] }) {
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

interface PillProps {
  puzzleId: string
  title: string
  /** The co-op being played, if this is one. */
  session: CoopSession | undefined
  /** Where a guest who leaves goes. */
  leaveTo: string
  triggerClassName: string | undefined
  triggerVariant?: 'flat' | undefined
  triggerSize?: 'compact' | undefined
  /** The phone's: the card rises as a sheet above the dock instead of dropping under the pill. */
  sheet?: boolean
}

/**
 * The people pill beside Sound and Theme, and its card: Play together while there's no co-op, then the link,
 * the seats and the Host's tools. Once live the pill is the players' faces, so who's in stays in view.
 */
export function CoopPill({ puzzleId, title, session, leaveTo, triggerClassName, triggerVariant, triggerSize, sheet }: PillProps) {
  const view = useCoopView(session)
  const room = view?.room
  const label = room ? `Co-op: ${room.seats.length} of ${COOP_SEATS} solving` : 'Play together'
  return (
    <Menu
      label={label}
      dialog
      trigger={room ? <Faces seats={room.seats} /> : <PeopleIcon />}
      triggerClassName={room ? `${triggerClassName ?? ''} ${styles.facesPill}` : triggerClassName}
      triggerVariant={triggerVariant}
      triggerSize={triggerSize}
      panelClassName={`${styles.card} ${sheet ? styles.sheet : ''}`}
    >
      {session && view?.room ? (
        <LiveCard session={session} view={view} leaveTo={leaveTo} />
      ) : (
        <StartCard puzzleId={puzzleId} title={title} />
      )}
    </Menu>
  )
}

function StartCard({ puzzleId, title }: { puzzleId: string; title: string }) {
  const { account, sync } = useAccount()
  const navigate = useNavigate()
  const [state, setState] = useState<'idle' | 'starting' | 'failed'>('idle')
  if (!account) {
    return (
      <>
        <h2>Co-op</h2>
        <p>Hosting a co-op needs an account. Friends you invite can join without one.</p>
        <SignInButtons />
      </>
    )
  }
  const start = async () => {
    setState('starting')
    try {
      // The co-op starts from the account's grid, so this device's latest has to be there first.
      await sync?.flush()
      const { code } = await createCoop(puzzleId)
      await navigate({ to: '/co/$code', params: { code } })
    } catch {
      setState('failed')
    }
  }
  return (
    <>
      <h2>Play together</h2>
      <p>Solve {title} with up to three friends on one grid. Co-op stickers are never foil.</p>
      <button type="button" data-variant="primary" data-size="compact" disabled={state === 'starting'} onClick={() => void start()}>
        Start a co-op
      </button>
      {state === 'failed' && <p role="status">Couldn’t start a co-op. Try again in a moment.</p>}
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

function LiveCard({ session, view, leaveTo }: { session: CoopSession; view: CoopView; leaveTo: string }) {
  const room = view.room!
  const host = room.you === 0
  const [copied, setCopied] = useState(false)
  const [ending, setEnding] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const link = `${location.host}/co/${room.code}`
  const copy = () =>
    navigator.clipboard.writeText(`${location.protocol}//${link}`).then(
      () => setCopied(true),
      () => {},
    )
  const open = COOP_SEATS - room.seats.length
  const blurb =
    room.seats.length === 1
      ? 'Send this link. Up to four can solve together.'
      : open === 0
        ? 'Solving together. Every seat is taken.'
        : `Solving together. The link still lets ${open === 1 ? 'one' : 'two'} more in.`

  return (
    <>
      <h2>Co-op</h2>
      <p>{blurb}</p>
      <div className={styles.link}>
        <code>{link}</code>
        <button type="button" data-variant="primary" data-size="compact" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>
      <ul className={styles.seats}>
        {Array.from({ length: COOP_SEATS }, (_, n) => {
          const s = room.seats.find(seat => seat.seat === n)
          if (!s) {
            return (
              <li key={n} className={styles.empty}>
                <span className={styles.dot} aria-hidden="true" />
                Open seat
              </li>
            )
          }
          const name = seatLabel(s)
          return (
            <li key={n}>
              <span className={styles.dot} style={dotStyle(n)} data-away={!s.connected || undefined} aria-hidden="true">
                {initialOf(s.name)}
              </span>
              <span className={styles.srOnly}>{SEAT_NAMES[n]}: </span>
              {name}
              {n === room.you && <span className={styles.you}>(you)</span>}
              <small>{n === 0 ? 'Host' : !s.connected ? 'Away' : ''}</small>
              {host && n !== 0 && (
                <button
                  type="button"
                  className={styles.remove}
                  data-variant="ghost"
                  data-size="compact"
                  aria-label={`Remove ${name}`}
                  title={`Remove ${name}`}
                  onClick={() => session.remove(n)}
                >
                  ×
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {host ? (
        ending ? (
          <div className={styles.row} role="group" aria-label="End co-op">
            <button type="button" data-variant="danger" data-size="compact" onClick={() => session.end()}>
              End for everyone
            </button>
            <button type="button" data-variant="paper" data-size="compact" onClick={() => setEnding(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <div className={styles.row}>
            <button
              type="button"
              data-variant="flat"
              data-size="compact"
              title="The old link stops working; everyone already in stays"
              onClick={() => session.newLink()}
            >
              New link
            </button>
            <button type="button" data-variant="flat" data-size="compact" onClick={() => setEnding(true)}>
              End co-op
            </button>
          </div>
        )
      ) : (
        <Link {...backLink(leaveTo)} data-variant="flat" data-size="compact">
          Leave co-op
        </Link>
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
