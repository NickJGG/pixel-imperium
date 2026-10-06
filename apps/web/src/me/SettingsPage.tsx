import { useEffect, useState } from 'react'
import { Link, getRouteApi, useRouter } from '@tanstack/react-router'
import { deleteAccount, signOutAccount, useAccount } from '../account.ts'
import { PROVIDERS, type Provider, linkSocial, listAccounts, signIn, unlinkAccount } from '../auth.ts'
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
      <h1 className={styles.heading}>Settings</h1>

      <section className={styles.card}>
        <h2>Handle</h2>
        <p>
          Your profile is at{' '}
          <Link to="/u/$handle" params={{ handle: account.handle }}>
            /u/{account.handle}
          </Link>
          . Changing your handle breaks links to the old one.
        </p>
        <HandleForm current={account.handle} submitLabel="Save" />
      </section>

      <section className={styles.card}>
        <h2>Sign-in methods</h2>
        {error && (
          <p role="alert" className={styles.bad}>
            {LINK_ERRORS[error] ?? 'Couldn’t connect that account. Try again.'}
          </p>
        )}
        <LinkedProviders {...accounts} />
      </section>

      <section className={styles.card}>
        <h2>Sign out</h2>
        <p>Your progress stays saved to your account.</p>
        <button type="button" onClick={() => void signOutAccount().then(leave)}>
          Sign out
        </button>
      </section>

      <section className={`${styles.card} ${styles.danger}`}>
        <h2>Delete account</h2>
        <DeleteAccount handle={account.handle} linked={linked} onDeleted={leave} />
      </section>
    </main>
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
                <strong>{p.label}</strong>
                <span className={styles.hint}>{row ? 'Connected' : 'Not connected'}</span>
              </span>
              {row ? (
                <button
                  type="button"
                  disabled={busy || lastOne}
                  title={lastOne ? 'Connect another method first, so you can still sign in.' : undefined}
                  onClick={() => void disconnect(row.id)}
                >
                  Disconnect
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => connect(p.id)}>
                  Connect
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {failure === 'failed' && (
        <p role="alert" className={styles.bad}>
          Couldn’t disconnect that account. Try again.
        </p>
      )}
      {failure === 'reauthenticate' && <Reauthenticate action="disconnecting" linked={linked} />}
    </>
  )
}

interface DeleteProps {
  handle: string
  linked: LinkedAccount[]
  onDeleted: () => Promise<void>
}

function DeleteAccount({ handle, linked, onDeleted }: DeleteProps) {
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

  return (
    <>
      <p>
        This permanently deletes your account, solves, progress and settings, and frees @{handle} for anyone. It
        can’t be undone.
      </p>
      <label className={styles.confirm}>
        <span>
          Type <strong>{handle}</strong> to confirm
        </span>
        <input value={typed} autoComplete="off" spellCheck={false} onChange={e => setTyped(e.target.value)} />
      </label>
      {state === 'failed' && (
        <p role="alert" className={styles.bad}>
          Couldn’t delete your account. Try again.
        </p>
      )}
      {state === 'reauthenticate' ? (
        <Reauthenticate action="deleting your account" linked={linked} />
      ) : (
        <button
          type="button"
          className={styles.destructive}
          disabled={!confirmed || state === 'deleting'}
          onClick={() => void remove()}
        >
          {state === 'deleting' ? 'Deleting…' : 'Delete account'}
        </button>
      )}
    </>
  )
}
