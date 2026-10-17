import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { COOP_SEATS, type CoopRoomInfo } from '@pixel-imperium/protocol'
import { usePadContain } from '../pad/PadProvider.tsx'
import { Faces, SignInButtons } from './CoopCard.tsx'
import { namesOf } from './seats.ts'
import styles from './Coop.module.css'

/** Never `retired-closed`: the card needs the puzzle, which that link can't serve. */
export type JoinInfo = Extract<CoopRoomInfo, { host: string }>

interface Props {
  info: JoinInfo
  signedIn: boolean
  onJoin: () => void
}

/**
 * Over the dimmed board of a co-op's puzzle: who invited this player and who's solving, and a deliberate Join, so a
 * link's unfurl or a stray tap never takes a seat. A full co-op, or one the Host removed them from, offers it solo.
 */
export function JoinCard({ info, signedIn, onJoin }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [signingIn, setSigningIn] = useState(false)
  usePadContain(cardRef, true, () => setSigningIn(false))
  useEffect(() => {
    cardRef.current?.querySelector<HTMLElement>('a, button')?.focus()
  }, [signingIn])

  const solo = (
    <Link to="/play/$id" params={{ id: info.puzzleId }} data-variant="primary" data-pad-default>
      Play it solo
    </Link>
  )
  const n = info.seats.length
  const body =
    info.access === 'full' ? (
      <>
        <h2 id="join-title">This co-op is full</h2>
        <p>Four are already solving {info.title}.</p>
        {solo}
      </>
    ) : info.access === 'removed' ? (
      <>
        <h2 id="join-title">You’re no longer in this co-op</h2>
        <p>@{info.host} removed you from it. You can still play the puzzle yourself.</p>
        {solo}
      </>
    ) : (
      <>
        <h2 id="join-title">
          @{info.host} invited you to solve {info.title} together
        </h2>
        <div className={styles.here}>
          <Faces seats={info.seats} />
          <span>
            {namesOf(info.seats)} {n === 1 ? 'is' : 'are'} solving · {n} of {COOP_SEATS}
          </span>
        </div>
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
