import { useEffect, useLayoutEffect, useRef } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { SignInMenu } from '../AccountMenu.tsx'
import { ProfileIcon, SettingsIcon } from '../album/icons.tsx'
import { useAccount } from '../account.ts'
import { useSession } from '../auth.ts'
import { NextUpCard } from '../campaign/NextUpCard.tsx'
import { CrownMark, SoundButton, themeIcon, themeLabel, useContinue } from '../Hud.tsx'
import { usePadContain } from '../pad/PadProvider.tsx'
import { usePrefetch } from '../play/prefetch.ts'
import { type Theme, updateSettings, useSettings } from '../settings.ts'
import { Trail } from '../Trail.tsx'
import { closeMenu, toggleMenu, useBoard, useMenu } from './menu-store.ts'
import app from '../App.module.css'
import hud from '../Hud.module.css'
import styles from './Menu.module.css'

const THEMES: readonly Theme[] = ['dark', 'light', 'auto']

/**
 * Pins the panel's crown over the one that opened it, or the first one showing, so the crown seems to hold still
 * while the panel opens around it. Without one, the panel's own defaults put it where the HUD's sits.
 */
function pinCrown(dialog: HTMLDialogElement, opener: HTMLElement | null): void {
  const crown =
    (opener?.isConnected && opener) ||
    [...document.querySelectorAll<HTMLElement>('[data-menu-crown]')].find(el => !dialog.contains(el) && el.checkVisibility())
  if (!crown) return
  const box = crown.getBoundingClientRect()
  const { offsetWidth: w, offsetHeight: h } = crown
  const crownStyle = getComputedStyle(crown)
  const mark = crown.querySelector('svg')
  const markStyle = mark && getComputedStyle(mark)
  const vars: Record<string, string> = {
    '--crown-x': `${box.left + (box.width - w) / 2}px`,
    '--crown-y': `${box.top + (box.height - h) / 2}px`,
    '--crown-w': `${w}px`,
    '--crown-h': `${h}px`,
    '--crown-rotate': crownStyle.rotate === 'none' ? '0deg' : crownStyle.rotate,
    ...(markStyle && { '--mark-w': markStyle.width, '--mark-h': markStyle.height }),
  }
  for (const [name, value] of Object.entries(vars)) dialog.style.setProperty(name, value)
}

/**
 * The menu any crown summons, over the dimmed page: the crown and wordmark, the trail, the puzzle due next, and a
 * footer of the player and the settings. Mounted once at the root; `menu-store.ts` holds whether it's open. M opens and closes it
 * anywhere, Esc or B closes it, as do the crown, the dimmed page and any link inside.
 */
export function MenuPanel() {
  const { open, opener } = useMenu()
  const ref = useRef<HTMLDialogElement>(null)
  const restore = useRef<HTMLElement | null>(null)
  restore.current = opener
  const pathname = useRouterState({ select: s => s.location.pathname })

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      pinCrown(dialog, opener)
      dialog.showModal()
      const first =
        dialog.querySelector<HTMLElement>('[data-menu-focus]') ?? dialog.querySelector<HTMLElement>(`.${styles.foot} :is(a, button)`)
      first?.focus()
    } else if (!open && dialog.open) {
      dialog.close()
    }
  }, [open, opener])
  usePadContain(ref, open, closeMenu, restore)

  useEffect(() => closeMenu(), [pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'm' || e.repeat || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return
      const dialog = ref.current
      const other = dialog?.open
        ? dialog.querySelector('[data-pad-contain]')
        : document.querySelector('dialog[open], [data-pad-contain]')
      if (other) return
      e.preventDefault()
      toggleMenu()
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [])

  return (
    <dialog
      ref={ref}
      className={styles.panel}
      aria-label="Menu"
      onClose={closeMenu}
      onClick={e => (e.target === e.currentTarget || (e.target as Element).closest('a')) && closeMenu()}
    >
      {open && <Contents />}
    </dialog>
  )
}

function Contents() {
  return (
    <>
      <button type="button" className={`${hud.crown} ${styles.crown}`} aria-label="Close menu" onClick={closeMenu}>
        <CrownMark />
      </button>
      <Link to="/" className={styles.wordmark}>
        <span>Pixel</span> Imperium
      </Link>
      <div className={styles.paper} data-surface="cobalt">
        <Trail />
        <NextUp />
        <div className={styles.foot}>
          <Profile />
          <Link to="/settings" className={styles.round} data-variant="flat" aria-label="Settings" title="Settings">
            <SettingsIcon />
          </Link>
          <span className={styles.gap} />
          <SoundButton className={styles.round} variant="flat" />
          <ThemeSwitch />
        </div>
      </div>
    </>
  )
}

/** The current campaign's Next up, unless its board is the one on the page. */
function NextUp() {
  const next = useContinue()
  const board = useBoard()
  const { storage } = useAccount()
  usePrefetch(next?.puzzle.id)
  if (!next || next.puzzle.id === board) return null
  return (
    <div className={styles.nextUp}>
      <NextUpCard next={next} storage={storage} menu />
    </div>
  )
}

/** The player's avatar to their album, or the sign-in sheet. */
function Profile() {
  const { data, isPending } = useSession()
  if (isPending) return <span className={styles.round} />
  if (!data) {
    return (
      <SignInMenu
        trigger={<ProfileIcon />}
        triggerClassName={styles.round}
        triggerVariant="flat"
        up
        panelClassName={styles.signIn}
      />
    )
  }
  const { handle, image } = data.user
  return (
    <Link
      to="/u/$handle"
      params={{ handle }}
      className={styles.round}
      data-variant="flat"
      aria-label={`Profile: @${handle}`}
      title="Profile"
    >
      <span className={app.face}>
        {image ? <img src={image} alt="" referrerPolicy="no-referrer" /> : <i aria-hidden="true">{handle[0]?.toUpperCase()}</i>}
      </span>
    </Link>
  )
}

function ThemeSwitch() {
  const { theme } = useSettings()
  return (
    <span className={styles.themes} role="group" aria-label="Theme">
      {THEMES.map(t => (
        <button
          key={t}
          type="button"
          data-variant="flat"
          data-size="compact"
          aria-pressed={theme === t}
          aria-label={themeLabel[t]}
          title={themeLabel[t]}
          onClick={() => updateSettings({ theme: t })}
        >
          {themeIcon[t]}
        </button>
      ))}
    </span>
  )
}
