import { useEffect, useState } from 'react'
import type { Friendship } from '@pixel-imperium/protocol'
import { Menu } from '../AccountMenu.tsx'
import { PROVIDERS, signIn } from '../auth.ts'
import { acceptFriend, addFriend, cancelFriend, unfriend } from '../friends/friends-store.ts'
import { PeopleIcon } from '../party/PartyCard.tsx'

/**
 * How the viewer stands with a Profile's owner, as the step to take next: Add friend, Request sent (which cancels it),
 * Accept request, or Friends ✓ with Remove friend behind it. Signed out (`null`), Add friend asks for sign-in first.
 */
export function FriendButton({ handle, friendship }: { handle: string; friendship: Friendship | null }) {
  const [state, setState] = useState(friendship)
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(false)
  useEffect(() => setState(friendship), [friendship, handle])

  if (state === 'self') return null
  if (state === null) {
    return (
      <Menu label="Add friend" trigger={<AddLabel />} dialog>
        <h2>Add @{handle} as a friend</h2>
        <p>Sign in to add friends, see who’s online and invite them to your party.</p>
        {PROVIDERS.map(p => (
          <button key={p.id} type="button" onClick={() => void signIn.social({ provider: p.id, callbackURL: window.location.href })}>
            Sign in with {p.label}
          </button>
        ))}
      </Menu>
    )
  }

  /** Shows `next` at once; back to how it stood if the server says no. */
  const step = (next: Friendship, call: () => Promise<boolean>) => {
    const before = state
    setBusy(true)
    setRemoving(false)
    setState(next)
    void call()
      .then(ok => !ok && setState(before))
      .finally(() => setBusy(false))
  }

  switch (state) {
    case 'none':
      return (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true)
            addFriend(handle)
              .then(
                outcome => setState(outcome === 'accepted' ? 'friends' : outcome === 'sent' || outcome === 'already' ? 'sent' : 'none'),
                () => {},
              )
              .finally(() => setBusy(false))
          }}
        >
          <AddLabel />
        </button>
      )
    case 'sent':
      return (
        <button
          type="button"
          data-variant="flat"
          disabled={busy}
          title="Cancel the request"
          aria-label={`Request sent to @${handle}. Cancel it`}
          onClick={() => step('none', () => cancelFriend(handle))}
        >
          Request sent · Cancel
        </button>
      )
    case 'received':
      return (
        <button type="button" data-variant="primary" disabled={busy} onClick={() => step('friends', () => acceptFriend(handle))}>
          <PeopleIcon />
          Accept request
        </button>
      )
    case 'friends':
      return (
        <Menu label={`Friends with @${handle}`} trigger="Friends ✓" dialog>
          {removing ? (
            <>
              <p>Remove @{handle} from your friends?</p>
              <button type="button" data-variant="danger" onClick={() => step('none', () => unfriend(handle))}>
                Remove friend
              </button>
              <button type="button" data-variant="flat" onClick={() => setRemoving(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setRemoving(true)}>
              Remove friend
            </button>
          )}
        </Menu>
      )
  }
}

function AddLabel() {
  return (
    <>
      <PeopleIcon />
      Add friend
    </>
  )
}
