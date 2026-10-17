import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PARTY_SEATS, type PartyInfo } from '@pixel-imperium/protocol'
import { usePadContain } from '../pad/PadProvider.tsx'
import { Faces, SignInButtons } from './PartyCard.tsx'
import { namesOf } from './seats.ts'
import styles from './Party.module.css'

/** Never `ended` or `retired-closed`: neither has a party to show. */
export type JoinInfo = Extract<PartyInfo, { host: string }>

interface Props {
  info: JoinInfo
  signedIn: boolean
  /** The Host of the Party this player is in now, which joining leaves; `you` when it's theirs. */
  leaving: string | null
  onJoin: () => void
}

/**
 * Over the dimmed board of a Party's puzzle, or on its own when it has none: who invited this player and who's in,
 * and a deliberate Join, so a link's unfurl or a stray tap never takes a seat. A full Party, or one whose Host removed
 * them, offers the puzzle solo.
 */
export function JoinCard({ info, signedIn, leaving, onJoin }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [signingIn, setSigningIn] = useState(false)
  usePadContain(cardRef, true, () => setSigningIn(false))
  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>('a, button')?.focus()
  }, [signingIn])

  const { puzzle } = info
  const away = puzzle ? (
    <Link to="/play/$id" params={{ id: puzzle.id }} data-variant="primary" data-pad-default>
      Play it solo
    </Link>
  ) : (
    <Link to="/" data-variant="primary" data-pad-default>
      Back home
    </Link>
  )
  const n = info.seats.length
  const body =
    info.access === 'full' ? (
      <>
        <h2 id="join-title">This party is full</h2>
        <p>Four are already in @{info.host}’s party.</p>
        {away}
      </>
    ) : info.access === 'removed' ? (
      <>
        <h2 id="join-title">You’re no longer in this party</h2>
        <p>
          @{info.host} removed you from it.{puzzle && ' You can still play the puzzle yourself.'}
        </p>
        {away}
      </>
    ) : (
      <>
        <h2 id="join-title">
          {puzzle ? `@${info.host} invited you to solve ${puzzle.title} together` : `@${info.host} invited you to their party`}
        </h2>
        <div className={styles.here}>
          <Faces seats={info.seats} />
          <span>
            {namesOf(info.seats)} {n === 1 ? 'is' : 'are'} {puzzle ? 'solving' : 'in the party'} · {n} of {PARTY_SEATS}
          </span>
        </div>
        {leaving && <p>{leaving === 'you' ? 'You’ll leave your own party.' : `You’ll leave @${leaving}’s party.`}</p>}
        {signedIn ? (
          <button type="button" data-variant="primary" onClick={onJoin}>
            Join as @{info.you}
          </button>
        ) : signingIn ? (
          <>
            <p>Your sticker goes on your account, on any device.</p>
            <SignInButtons />
            <button type="button" data-variant="paper" onClick={() => setSigningIn(false)}>
              Back
            </button>
          </>
        ) : (
          <>
            <p>
              You’ll join as <b>{info.you}</b>. Sign in first to keep the sticker on your account.
            </p>
            <div className={styles.row}>
              <button type="button" data-variant="primary" onClick={onJoin}>
                Join
              </button>
              <button type="button" data-variant="paper" onClick={() => setSigningIn(true)}>
                Sign in first
              </button>
            </div>
          </>
        )}
      </>
    )

  return (
    <div className={styles.veil}>
      <div ref={cardRef} className={`${styles.card} ${styles.joinCard}`} role="dialog" aria-modal="true" aria-labelledby="join-title">
        {body}
      </div>
    </div>
  )
}
