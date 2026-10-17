import { type ReactNode, useEffect, useRef, useState } from 'react'
import { usePadContain } from './pad/PadProvider.tsx'
import { PROVIDERS, signIn, useSession } from './auth.ts'
import styles from './App.module.css'

interface TriggerProps {
  triggerClassName?: string | undefined
  /** The trigger's house-button `data-variant` and `data-size`. */
  triggerVariant?: 'paper' | 'flat' | undefined
  triggerSize?: 'compact' | undefined
}

interface SignInMenuProps extends TriggerProps {
  trigger: ReactNode
  label?: string | undefined
  /** Opens above the trigger. */
  up?: boolean
  panelClassName?: string | undefined
}

/** The "Keep your album safe" sheet and its providers, behind `trigger`. */
export function SignInMenu({ trigger, label, up, ...triggerProps }: SignInMenuProps) {
  return (
    <Menu label={label ?? 'Sign in'} trigger={trigger} up={up} {...triggerProps}>
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

interface MenuProps extends TriggerProps {
  label: string
  trigger: ReactNode
  up?: boolean | undefined
  /** A card of its own rather than a list of items. */
  dialog?: boolean | undefined
  /** Placement in place of the sheet's own. */
  panelClassName?: string | undefined
  children: ReactNode
}

/** A trigger and the sheet it opens, which a pointer outside, Escape or one of its menu items closes. */
export function Menu({
  label,
  trigger,
  triggerClassName,
  triggerVariant,
  triggerSize,
  up,
  dialog,
  panelClassName,
  children,
}: MenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  usePadContain(menuRef, open, () => setOpen(false), triggerRef)

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent) => !rootRef.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setOpen(false)
    }
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
        aria-haspopup={dialog ? 'dialog' : 'menu'}
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menuRef}
          className={`${styles.menu} ${up ? styles.up : ''} ${panelClassName ?? ''}`}
          data-surface="paper"
          role={dialog ? 'dialog' : 'menu'}
          aria-label={dialog ? label : undefined}
          onClick={e => (e.target as Element).closest('[role="menuitem"]') && setOpen(false)}
        >
          {children}
        </div>
      )}
    </div>
  )
}
