import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import { signOutAccount } from './account.ts'
import { usePadContain } from './pad/PadProvider.tsx'
import { AlbumIcon, SettingsIcon, SignOutIcon } from './album/icons.tsx'
import { PROVIDERS, signIn, useSession } from './auth.ts'
import styles from './App.module.css'

/** The avatar sticker and its menu sheet when signed in; a "Sign in" sheet when signed out. */
export function AccountMenu() {
  const { data, isPending } = useSession()
  const router = useRouter()
  if (isPending) return null
  if (!data) return <SignInMenu trigger="Sign in" triggerClassName={styles.signIn} />

  const { handle, image } = data.user
  return (
    <Menu
      label={`Account: @${handle}`}
      triggerClassName={styles.avatar}
      trigger={
        <>
          <span className={styles.face}>
            {image ? (
              <img src={image} alt="" referrerPolicy="no-referrer" />
            ) : (
              <i aria-hidden="true">{handle[0]?.toUpperCase()}</i>
            )}
          </span>
          <span className={styles.handle}>@{handle}</span>
        </>
      }
    >
      <Link to="/u/$handle" params={{ handle }} role="menuitem" className={styles.item}>
        <span className={styles.ico}>
          <AlbumIcon />
        </span>
        My album
      </Link>
      <Link to="/settings" role="menuitem" className={styles.item}>
        <span className={styles.ico}>
          <SettingsIcon />
        </span>
        Settings
      </Link>
      <button
        type="button"
        role="menuitem"
        className={styles.item}
        onClick={() => void signOutAccount().then(() => router.invalidate())}
      >
        <span className={styles.ico}>
          <SignOutIcon />
        </span>
        Sign out
      </button>
    </Menu>
  )
}

interface SignInMenuProps {
  trigger: ReactNode
  triggerClassName: string | undefined
  /** Opens above the trigger, for the thumb bar. */
  up?: boolean
}

export function SignInMenu({ trigger, triggerClassName, up }: SignInMenuProps) {
  return (
    <Menu label="Sign in" trigger={trigger} triggerClassName={triggerClassName} up={up}>
      <h2>Keep your album safe</h2>
      <p>Sign in to earn foil and keep your stickers on any device.</p>
      {PROVIDERS.map(p => (
        <button
          key={p.id}
          type="button"
          role="menuitem"
          onClick={() => void signIn.social({ provider: p.id, callbackURL: window.location.href })}
        >
          Sign in with {p.label}
        </button>
      ))}
    </Menu>
  )
}

interface MenuProps {
  label: string
  trigger: ReactNode
  triggerClassName: string | undefined
  up?: boolean | undefined
  children: ReactNode
}

function Menu({ label, trigger, triggerClassName, up, children }: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  usePadContain(menuRef, open, () => setOpen(false), triggerRef)

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
      <button
        ref={triggerRef}
        type="button"
        data-pad-menu
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`${styles.menu} ${up ? styles.up : ''}`}
          role="menu"
          onClick={e => (e.target as Element).closest('[role="menuitem"]') && setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
