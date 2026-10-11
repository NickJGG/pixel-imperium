import { useEffect, useState } from 'react'
import { Link, getRouteApi, useRouter } from '@tanstack/react-router'
import { deleteAccount, signOutAccount, useAccount } from '../account.ts'
import { PROVIDERS, type Provider, linkSocial, listAccounts, signIn, unlinkAccount } from '../auth.ts'
import { Nameplate } from '../album/Nameplate.tsx'
import { type Theme, updateSettings, useSettings } from '../settings.ts'
import { HandleForm } from './HandleForm.tsx'
import styles from './Me.module.css'

const route = getRouteApi('/settings')

/** Better Auth's link failures, passed back as `?error=` on the redirect to this page. */
const LINK_ERRORS: Record<string, string> = {
  account_already_linked_to_different_user: 'That account already belongs to another player.',
}

interface LinkedAccount {
  /** Better Auth's row id, which unlinking takes. */
  id: string
  providerId: string
}

/** `null` while loading, `'failed'` if the list couldn't be fetched. */
function useLinkedAccounts() {
  const [linked, setLinked] = useState<LinkedAccount[] | 'failed' | null>(null)
  const reload = async () => {
    const { data } = await listAccounts()
    setLinked(data ? data.map(({ id, providerId }) => ({ id, providerId })) : 'failed')
  }
  useEffect(() => {
    void reload()
  }, [])
  return { linked, reload }
}

export function SettingsPage() {
  const { account } = useAccount()
  const accounts = useLinkedAccounts()
  const { error } = route.useSearch()
  const navigate = route.useNavigate()
  const router = useRouter()

  useEffect(() => {
    if (!account) void navigate({ to: '/' })
  }, [account, navigate])
  if (!account) return null

  const leave = async () => {
    await router.invalidate()
    await navigate({ to: '/' })
  }
  const linked = Array.isArray(accounts.linked) ? accounts.linked : []

  return (
    <main className={styles.page}>
      <div className={styles.backCover}>
        <header className={styles.coverHead}>
          <Nameplate handle={account.handle} />
          <h1 className={styles.heading}>Settings</h1>
        </header>

        <div className={styles.cards}>
          <section className={styles.card} aria-labelledby="handle-title">
            <h2 id="handle-title">Handle</h2>
            <HandleCard handle={account.handle} />
          </section>

          <section className={styles.card} aria-labelledby="play-title">
            <h2 id="play-title">Play</h2>
            <PlaySettings />
          </section>

          <section className={styles.card} aria-labelledby="methods-title">
            <h2 id="methods-title">Sign-in methods</h2>
            {error && (
              <p role="alert" className={styles.bad}>
                {LINK_ERRORS[error] ?? 'Couldn’t connect that account. Try again.'}
              </p>
            )}
            <LinkedProviders {...accounts} />
            <div className={styles.line}>
              <span className={styles.soft}>Your stickers stay saved to your album.</span>
              <button type="button" onClick={() => void signOutAccount().then(leave)}>
                Sign out
              </button>
            </div>
          </section>

          <section className={`${styles.card} ${styles.danger}`} aria-labelledby="delete-title">
            <h2 id="delete-title">Delete album</h2>
            <DeleteAccount handle={account.handle} linked={linked} onDeleted={leave} />
          </section>
        </div>
      </div>
    </main>
  )
}

function HandleCard({ handle }: { handle: string }) {
  const [editing, setEditing] = useState(false)
  if (editing) {
    return (
      <>
        <p className={styles.soft}>Changing your handle breaks links to the old one.</p>
        <HandleForm current={handle} submitLabel="Save" onSaved={() => setEditing(false)} />
        <button type="button" data-variant="ghost" className={styles.cancel} onClick={() => setEditing(false)}>
          Cancel
        </button>
      </>
    )
  }
  return (
    <div className={styles.line}>
      <Link to="/u/$handle" params={{ handle }} className={styles.handle}>
        @{handle}
      </Link>
      <button type="button" data-size="compact" onClick={() => setEditing(true)}>
        Change
      </button>
    </div>
  )
}

const THEMES: { value: Theme; label: string }[] = [
  { value: 'dark', label: 'Night' },
  { value: 'light', label: 'Day' },
  { value: 'auto', label: 'Auto' },
]

/** This device's sound and theme; neither syncs to the account. */
function PlaySettings() {
  const { sound, theme } = useSettings()
  return (
    <>
      <div className={styles.line}>
        <span id="sound-label">Sound effects</span>
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={sound}
          aria-labelledby="sound-label"
          onClick={() => updateSettings({ sound: !sound })}
        />
      </div>
      <div className={styles.line}>
        <span id="theme-label">Album</span>
        <span className={styles.seg} role="group" aria-labelledby="theme-label">
          {THEMES.map(t => (
            <button
              key={t.value}
              type="button"
              data-variant="flat"
              data-size="compact"
              aria-pressed={theme === t.value}
              onClick={() => updateSettings({ theme: t.value })}
            >
              {t.label}
            </button>
          ))}
        </span>
      </div>
      <p className={styles.soft}>Saved on this device only.</p>
    </>
  )
}

/**
 * Better Auth refuses unlinking and deletion once the session is a day old; signing in again
 * refreshes it. Only linked providers are offered, since another could sign in to a different account.
 */
function Reauthenticate({ action, linked }: { action: string; linked: LinkedAccount[] }) {
  return (
    <>
      <p role="alert">For safety, sign in again before you {action}.</p>
      <div className={styles.row}>
        {PROVIDERS.filter(p => linked.some(a => a.providerId === p.id)).map(p => (
          <button key={p.id} type="button" onClick={() => void signIn.social({ provider: p.id, callbackURL: '/settings' })}>
            Sign in with {p.label}
          </button>
        ))}
      </div>
    </>
  )
}

function LinkedProviders({ linked, reload }: ReturnType<typeof useLinkedAccounts>) {
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<'reauthenticate' | 'failed' | null>(null)

  if (linked === 'failed') return <p className={styles.bad}>Couldn’t load your sign-in methods.</p>
  if (!linked) return <p className={styles.hint}>Loading…</p>

  const connect = (provider: Provider) => {
    setBusy(true)
    void linkSocial({ provider, callbackURL: '/settings', errorCallbackURL: '/settings' })
  }

  const disconnect = async (accountId: string) => {
    setBusy(true)
    setFailure(null)
    const { error } = await unlinkAccount({ accountId })
    if (error) setFailure(error.code === 'SESSION_EXPIRED' ? 'reauthenticate' : 'failed')
    else await reload()
    setBusy(false)
  }

  return (
    <>
      <ul className={styles.providers}>
        {PROVIDERS.map(p => {
          const row = linked.find(a => a.providerId === p.id)
          const lastOne = row && linked.length === 1
          return (
            <li key={p.id}>
              <span>
                {p.label}
                {row && <span className={styles.soft}> · linked</span>}
              </span>
              {row ? (
                <button
                  type="button"
                  data-variant="ghost"
                  disabled={busy || lastOne}
                  title={lastOne ? 'Connect another method first, so you can still sign in.' : undefined}
                  onClick={() => void disconnect(row.id)}
                >
                  Unlink
                </button>
              ) : (
                <button type="button" data-size="compact" disabled={busy} onClick={() => connect(p.id)}>
                  Link
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {failure === 'failed' && (
        <p role="alert" className={styles.bad}>
          Couldn’t unlink that account. Try again.
        </p>
      )}
      {failure === 'reauthenticate' && <Reauthenticate action="unlinking" linked={linked} />}
    </>
  )
}

interface DeleteProps {
  handle: string
  linked: LinkedAccount[]
  onDeleted: () => Promise<void>
}

/** Two steps: open the confirmation, then type the handle to arm the final button. */
function DeleteAccount({ handle, linked, onDeleted }: DeleteProps) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState('')
  const [state, setState] = useState<'idle' | 'deleting' | 'reauthenticate' | 'failed'>('idle')
  const confirmed = typed.toLowerCase() === handle.toLowerCase()

  const remove = async () => {
    setState('deleting')
    try {
      const result = await deleteAccount()
      if (result === 'deleted') await onDeleted()
      else setState('reauthenticate')
    } catch {
      setState('failed')
    }
  }

  if (!open) {
    return (
      <>
        <p className={styles.soft}>Removes your account and every sticker. This can’t be undone.</p>
        <button type="button" data-variant="danger" className={styles.start} onClick={() => setOpen(true)}>
          Delete album
        </button>
      </>
    )
  }

  return (
    <>
      <p className={styles.soft}>
        This permanently deletes your account, stickers, progress and settings, and frees @{handle} for anyone.
      </p>
      <label className={styles.confirm}>
        <span>
          Type <strong>{handle}</strong> to confirm
        </span>
        <input value={typed} autoComplete="off" spellCheck={false} onChange={e => setTyped(e.target.value)} />
      </label>
      {state === 'failed' && (
        <p role="alert" className={styles.bad}>
          Couldn’t delete your album. Try again.
        </p>
      )}
      {state === 'reauthenticate' ? (
        <Reauthenticate action="deleting your album" linked={linked} />
      ) : (
        <div className={styles.row}>
          <button
            type="button"
            data-variant="ghost"
            disabled={state === 'deleting'}
            onClick={() => {
              setOpen(false)
              setTyped('')
            }}
          >
            Keep it
          </button>
          <button
            type="button"
            data-variant="danger"
            disabled={!confirmed || state === 'deleting'}
            onClick={() => void remove()}
          >
            {state === 'deleting' ? 'Deleting…' : 'Delete for good'}
          </button>
        </div>
      )}
    </>
  )
}
