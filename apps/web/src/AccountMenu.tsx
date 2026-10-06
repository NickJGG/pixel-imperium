import { type ReactNode, useEffect, useRef, useState } from 'react'
import { type Provider, signIn, signOut, useSession } from './auth.ts'
import styles from './App.module.css'

const providers: { id: Provider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'discord', label: 'Discord' },
]

/** "Sign in" with a provider menu when signed out; avatar and handle with a Sign out menu when signed in. */
export function AccountMenu() {
  const { data, isPending } = useSession()
  if (isPending) return null

  if (!data) {
    return (
      <Menu label="Sign in" trigger="Sign in">
        {providers.map(p => (
          <button
            key={p.id}
            type="button"
            role="menuitem"
            onClick={() => void signIn.social({ provider: p.id, callbackURL: window.location.href })}
          >
            {p.label}
          </button>
        ))}
      </Menu>
    )
  }

  const { handle, image } = data.user
  return (
    <Menu
      label={`Account: @${handle}`}
      trigger={
        <>
          {image ? (
            <img className={styles.avatar} src={image} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className={styles.avatar} aria-hidden="true">
              {handle[0]?.toUpperCase()}
            </span>
          )}
          <span className={styles.handle}>@{handle}</span>
        </>
      }
    >
      <button type="button" role="menuitem" onClick={() => void signOut()}>
        Sign out
      </button>
    </Menu>
  )
}

function Menu({ label, trigger, children }: { label: string; trigger: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className={styles.menuRoot}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {trigger}
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {children}
        </div>
      )}
    </div>
  )
}
