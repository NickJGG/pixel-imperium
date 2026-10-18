import { type FormEvent, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { type Friend, type FriendPerson, type FriendRequestOutcome, PARTY_SEATS } from '@pixel-imperium/protocol'
import { useAccount } from '../account.ts'
import {
  acceptFriend,
  addFriend,
  cancelFriend,
  declineFriend,
  unfriend,
  useFriends,
} from '../friends/friends-store.ts'
import { SignInButtons } from '../party/PartyCard.tsx'
import { party, usePartyView } from '../party/party-store.ts'
import app from '../App.module.css'
import styles from './Columns.module.css'

/**
 * The menu's Friends column: adding one by Handle, requests waiting on this player, friends online (to invite) then
 * offline, and requests this player sent. Signed out, why to sign in.
 */
export function FriendsColumn() {
  const { account } = useAccount()
  const view = usePartyView()
  const friends = useFriends()
  const online = view.friends.filter(f => f.online).length
  if (!account) {
    return (
      <section className={styles.column} aria-labelledby="friends-column-title">
        <h2 id="friends-column-title" className={styles.heading}>
          Friends
        </h2>
        <p className={styles.blurb}>Sign in to add friends, see who’s online and invite them to your party.</p>
        <div className={styles.actions}>
          <SignInButtons variant="paper" />
        </div>
      </section>
    )
  }
  const live = friends?.friends.filter(f => f.online) ?? []
  const away = friends?.friends.filter(f => !f.online) ?? []
  return (
    <section className={styles.column} aria-labelledby="friends-column-title">
      <h2 id="friends-column-title" className={styles.heading}>
        Friends
        <small>{online} online</small>
      </h2>
      <AddField />
      {friends?.incoming.map(p => (
        <div key={p.handle} className={styles.note}>
          <Face person={p} />
          <span>
            <b>@{p.handle}</b> wants to be friends
          </span>
          <button type="button" data-size="compact" onClick={() => void acceptFriend(p.handle)}>
            Accept
          </button>
          <button type="button" data-variant="flat" data-size="compact" onClick={() => void declineFriend(p.handle)}>
            Decline
          </button>
        </div>
      ))}
      {friends && (
        <ul className={styles.list}>
          {live.length > 0 ? (
            live.map(f => <FriendRow key={f.handle} friend={f} />)
          ) : (
            <li className={styles.blurb}>
              {friends.friends.length > 0 ? 'None of your friends are online.' : 'Add a friend by their @handle to invite them to your party.'}
            </li>
          )}
        </ul>
      )}
      {away.length > 0 && (
        <>
          <h3 className={styles.subheading}>Offline</h3>
          <ul className={styles.list}>
            {away.map(f => (
              <FriendRow key={f.handle} friend={f} />
            ))}
          </ul>
        </>
      )}
      {friends && friends.outgoing.length > 0 && (
        <ul className={styles.list} aria-label="Requests sent">
          {friends.outgoing.map(p => (
            <li key={p.handle} className={styles.row} data-off>
              <Face person={p} />
              <span className={styles.who}>
                @{p.handle}
                <small>Request sent</small>
              </span>
              <button type="button" data-variant="flat" data-size="compact" onClick={() => void cancelFriend(p.handle)}>
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

const OUTCOME: Record<FriendRequestOutcome, (handle: string) => string> = {
  sent: h => `Request sent to @${h}.`,
  accepted: h => `You and @${h} are friends now.`,
  'not-found': h => `No player called @${h}.`,
  self: () => 'That’s you.',
  already: h => `You’re already friends with @${h}, or asked them.`,
}

function AddField() {
  const [handle, setHandle] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ text: string; failed: boolean } | null>(null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const wanted = handle.trim().replace(/^@/, '')
    if (!wanted || busy) return
    setBusy(true)
    addFriend(wanted)
      .then(
        outcome => {
          setSaid({ text: OUTCOME[outcome](wanted), failed: outcome !== 'sent' && outcome !== 'accepted' })
          if (outcome === 'sent' || outcome === 'accepted') setHandle('')
        },
        () => setSaid({ text: 'Couldn’t send that. Try again in a while.', failed: true }),
      )
      .finally(() => setBusy(false))
  }
  return (
    <form className={styles.add} onSubmit={submit}>
      <div className={styles.addRow}>
        <input
          type="text"
          value={handle}
          onChange={e => {
            setHandle(e.target.value)
            setSaid(null)
          }}
          placeholder="Add a friend by @handle"
          aria-label="Add a friend by handle"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={said?.failed || undefined}
          aria-describedby={said ? 'add-friend-said' : undefined}
        />
        <button type="submit" data-size="compact" disabled={busy || !handle.trim()}>
          Add
        </button>
      </div>
      {said && (
        <p id="add-friend-said" className={styles.said} role={said.failed ? 'alert' : 'status'} data-failed={said.failed || undefined}>
          {said.text}
        </p>
      )}
    </form>
  )
}

function FriendRow({ friend: f }: { friend: Friend }) {
  const view = usePartyView()
  const [more, setMore] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [invited, setInvited] = useState(false)
  const current = view.party
  const inMine = current?.seats.some(s => s.account && s.name.toLowerCase() === f.handle.toLowerCase()) ?? false
  const full = current !== null && current.seats.length >= PARTY_SEATS
  const status = !f.online ? 'Offline' : inMine ? 'In your party' : f.party !== null ? `In a party · ${f.party}/${PARTY_SEATS}` : 'Online'
  const invite = () => {
    setInvited(true)
    if (!current) party.startParty()
    party.invite(f.handle)
  }
  return (
    <li className={styles.friend}>
      <div className={styles.row} data-off={!f.online || undefined}>
        <Face person={f} />
        <span className={styles.who}>
          @{f.handle}
          <small>
            {f.online && <i className={styles.on} aria-hidden="true" />}
            {status}
          </small>
        </span>
        {f.online && !inMine && !full && (
          <button
            type="button"
            data-size="compact"
            disabled={invited || view.status !== 'live'}
            title={current ? undefined : 'Starts a party and invites them'}
            onClick={invite}
          >
            {invited ? 'Invited' : 'Invite'}
          </button>
        )}
        <button
          type="button"
          className={styles.x}
          data-variant="flat"
          data-size="compact"
          aria-label={`More for @${f.handle}`}
          aria-expanded={more}
          onClick={() => {
            setMore(!more)
            setRemoving(false)
          }}
        >
          ⋯
        </button>
      </div>
      {more && (
        <div className={styles.more}>
          {removing ? (
            <>
              <span>Remove @{f.handle}?</span>
              <button type="button" data-variant="danger" data-size="compact" onClick={() => void unfriend(f.handle)}>
                Remove
              </button>
              <button type="button" data-variant="flat" data-size="compact" onClick={() => setRemoving(false)}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <Link to="/u/$handle" params={{ handle: f.handle }} data-variant="flat" data-size="compact">
                View profile
              </Link>
              <button type="button" data-variant="flat" data-size="compact" onClick={() => setRemoving(true)}>
                Remove friend
              </button>
            </>
          )}
        </div>
      )}
    </li>
  )
}

function Face({ person }: { person: FriendPerson }) {
  return (
    <span className={`${app.face} ${styles.face}`} aria-hidden="true">
      {person.image ? <img src={person.image} alt="" referrerPolicy="no-referrer" /> : <i>{person.handle[0]?.toUpperCase()}</i>}
    </span>
  )
}
