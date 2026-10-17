import { useEffect, useSyncExternalStore } from 'react'
import { Link } from '@tanstack/react-router'
import { PARTY_SEATS } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import { toggleMenu, useMenu } from '../menu/menu-store.ts'
import { Faces, PeopleIcon, useAcceptInvite } from './PartyCard.tsx'
import { party, usePartyView } from './party-store.ts'
import { type Slip, pickSlip, slipItem, tucks, waiting } from './slip.ts'
import styles from './Party.module.css'

/**
 * The party sticker, opening the menu on Party. Out of a Party it's the people icon with the count of Friends online;
 * in one, the players' faces and the seats taken. Signed out it's the icon alone. A pink dot marks anything waiting.
 * `small` is the phone's, in its top line and thumb bar.
 */
export function PartySticker({ small = false }: { small?: boolean }) {
  const { account } = useAccount()
  const view = usePartyView()
  const { open, column } = useMenu()
  const current = view.party
  const online = account ? view.friends.filter(f => f.online).length : 0
  const dot = waiting(view)
  const label = [
    current ? `Party: ${current.seats.length} of ${PARTY_SEATS}` : 'Party and friends',
    online > 0 && `${online} online`,
    dot && 'something waiting',
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <button
      type="button"
      className={small ? `${styles.sticker} ${styles.small}` : styles.sticker}
      data-bare={(!current && online === 0) || undefined}
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open && column === 'party'}
      onClick={e => toggleMenu(e.currentTarget, 'party')}
    >
      {current ? (
        <>
          <Faces seats={current.seats} />
          <span className={styles.count}>
            {current.seats.length}/{PARTY_SEATS}
          </span>
        </>
      ) : (
        <>
          <PeopleIcon />
          {online > 0 && <span className={styles.online}>{online}</span>}
        </>
      )}
      {dot && <span className={styles.ping} />}
    </button>
  )
}

function useSlip(): Slip | null {
  const view = usePartyView()
  useSyncExternalStore(tucks.subscribe, tucks.getVersion)
  const slip = pickSlip(view, tucks.has)
  const item = slip && slipItem(slip)
  useEffect(() => {
    if (item) tucks.shown(item)
  }, [item])
  return slip
}

/**
 * The newest invite, or the Party's new puzzle for a player away from its page, as a pink slip in the sticker's row.
 * It never takes focus, and tucks into the sticker's dot after a while; the Party column keeps it until answered.
 */
export function InviteSlip({ className }: { className?: string | undefined }) {
  const slip = useSlip()
  const accept = useAcceptInvite()
  const inParty = usePartyView().party !== null
  if (!slip) return null
  const cls = className ? `${styles.slip} ${className}` : styles.slip
  if (slip.kind === 'started') {
    const { started } = slip
    return (
      <span className={cls} role="status">
        <span className={styles.slipText}>
          <b>@{started.by}</b> started <b>{started.title}</b>
        </span>
        <Link to="/play/$id" params={{ id: started.puzzleId }} data-variant="primary" data-size="compact">
          Join
        </Link>
        <button type="button" data-variant="flat" data-size="compact" onClick={() => party.dismissStarted()}>
          Later
        </button>
      </span>
    )
  }
  const { invite } = slip
  return (
    <span className={cls} role="status">
      <span className={styles.slipText}>
        <b>@{invite.from}</b> invited you to {invite.from === invite.host ? 'their' : `@${invite.host}’s`} party
        {inParty && ' · you’ll leave yours'}
      </span>
      <button type="button" data-variant="primary" data-size="compact" onClick={() => accept(invite)}>
        Join
      </button>
      <button type="button" data-variant="flat" data-size="compact" onClick={() => party.respond(invite.id, false)}>
        Decline
      </button>
    </span>
  )
}
