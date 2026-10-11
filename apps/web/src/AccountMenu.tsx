import { type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useRouter, useRouterState } from '@tanstack/react-router'
import { signOutAccount } from './account.ts'
import { usePadContain } from './pad/PadProvider.tsx'
import { AlbumIcon, LearnIcon, SettingsIcon, SignOutIcon } from './album/icons.tsx'
import { PROVIDERS, signIn, useSession } from './auth.ts'
import { isBackPath } from './tutorial/handoff.ts'
import styles from './App.module.css'

/** The avatar sticker and its menu sheet when signed in; a "Sign in" sheet when signed out. */
export function AccountMenu() {
  const { data, isPending } = useSession()
  if (isPending) return null
  if (!data) return <SignInMenu trigger="Sign in" triggerVariant="paper" triggerSize="compact" />

  const { handle, image } = data.user
  return (
    <Menu
      label={`Account: @${handle}`}
      triggerClassName={styles.avatar}
      triggerVariant="flat"
      triggerSize="compact"
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
      <AccountItems handle={handle} />
    </Menu>
  )
}

/**
 * The phone thumb bar's Profile: the account menu or the sign-in sheet, opening upwards, with Learn added
 * since the phone's HUD leaves both out.
 */
export function ThumbMenu({ trigger, triggerClassName }: { trigger: ReactNode; triggerClassName: string | undefined }) {
  const { data, isPending } = useSession()
  if (isPending) return <span />
  const common = { trigger, triggerClassName, triggerVariant: 'flat', up: true } as const
  if (!data) {
    return (
      <SignInMenu {...common}>
        <LearnItem />
      </SignInMenu>
    )
  }
  return (
    <Menu label={`Account: @${data.user.handle}`} {...common}>
      <LearnItem />
      <AccountItems handle={data.user.handle} />
    </Menu>
  )
}

function LearnItem() {
  const pathname = useRouterState({ select: s => s.location.pathname })
  return (
    <Link
      to="/learn"
      search={isBackPath(pathname) ? { back: pathname } : {}}
      role="menuitem"
      className={styles.item}
      data-variant="flat"
    >
      <span className={styles.ico}>
        <LearnIcon />
      </span>
      Learn
    </Link>
  )
}

function AccountItems({ handle }: { handle: string }) {
  const router = useRouter()
  return (
    <>
      <Link to="/u/$handle" params={{ handle }} role="menuitem" className={styles.item} data-variant="flat">
        <span className={styles.ico}>
          <AlbumIcon />
        </span>
        My album
      </Link>
      <Link to="/settings" role="menuitem" className={styles.item} data-variant="flat">
        <span className={styles.ico}>
          <SettingsIcon />
        </span>
        Settings
      </Link>
      <button
        type="button"
        role="menuitem"
        className={styles.item}
        data-variant="flat"
        onClick={() => void signOutAccount().then(() => router.invalidate())}
      >
        <span className={styles.ico}>
          <SignOutIcon />
        </span>
        Sign out
      </button>
    </>
  )
}

interface TriggerProps {
  triggerClassName?: string | undefined
  /** The trigger's house-button `data-variant` and `data-size`. */
  triggerVariant?: 'paper' | 'flat' | undefined
  triggerSize?: 'compact' | undefined
}

interface SignInMenuProps extends TriggerProps {
  trigger: ReactNode
  /** Opens above the trigger, for the thumb bar. */
  up?: boolean
  /** Below the providers. */
  children?: ReactNode
}

function SignInMenu({ trigger, up, children, ...triggerProps }: SignInMenuProps) {
  return (
    <Menu label="Sign in" trigger={trigger} up={up} {...triggerProps}>
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
      {children}
    </Menu>
  )
}

interface MenuProps extends TriggerProps {
  label: string
  trigger: ReactNode
  up?: boolean | undefined
  children: ReactNode
}

function Menu({ label, trigger, triggerClassName, triggerVariant, triggerSize, up, children }: MenuProps) {
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
        data-variant={triggerVariant}
        data-size={triggerSize}
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
          data-surface="paper"
          role="menu"
          onClick={e => (e.target as Element).closest('[role="menuitem"]') && setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
