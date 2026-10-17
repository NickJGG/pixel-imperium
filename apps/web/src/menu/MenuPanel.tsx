import { useEffect, useLayoutEffect, useRef, useState } from 'react'
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

/** On a phone, the sheet stands on the thumb bar, where there is one. */
function seatSheet(dialog: HTMLDialogElement): void {
  const bar = document.querySelector<HTMLElement>('[data-thumb-bar]')
  const bottom = bar?.checkVisibility() ? innerHeight - bar.getBoundingClientRect().top : 0
  dialog.style.setProperty('--sheet-bottom', `${bottom}px`)
}

/** Numbers the stickers in reading order, the trail's, the card and the footer's, so they slap on in turn. */
function stagger(dialog: HTMLDialogElement): void {
  const stickers = dialog.querySelectorAll<HTMLElement>(`.${styles.paper} nav a, .${styles.nextUp}, .${styles.foot} > :not(.${styles.gap})`)
  stickers.forEach((el, i) => {
    el.classList.add(`${styles.slap}`)
    el.style.setProperty('--i', String(i))
  })
  dialog.style.setProperty('--n', String(stickers.length))
}

/**
 * The menu any crown summons, over the dimmed page: the crown and wordmark, the trail, the puzzle due next, and a
 * footer of the player and the settings. Mounted once at the root; `menu-store.ts` holds whether it's open. M opens and closes it
 * anywhere, Esc or B closes it, as do the crown, the dimmed page and any link inside. It wipes open and its stickers
 * slap on (`Menu.module.css`); closing plays that back and only then closes the dialog, except for a navigation,
 * which closes it at once so the page's morph never captures it. On a phone it rises as a sheet instead.
 */
export function MenuPanel() {
  const { open, opener } = useMenu()
  const ref = useRef<HTMLDialogElement>(null)
  const restore = useRef<HTMLElement | null>(null)
  restore.current = opener
  const [closing, setClosing] = useState(false)
  const pathname = useRouterState({ select: s => s.location.pathname })

  const closeNow = () => {
    ref.current?.close()
    closeMenu()
  }

  useLayoutEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      setClosing(false)
      if (dialog.open) return
      pinCrown(dialog, opener)
      seatSheet(dialog)
      stagger(dialog)
      dialog.showModal()
      const first =
        dialog.querySelector<HTMLElement>('[data-menu-focus]') ?? dialog.querySelector<HTMLElement>(`.${styles.foot} :is(a, button)`)
      first?.focus()
    } else if (dialog.open) {
      setClosing(true)
    }
  }, [open, opener])
  usePadContain(ref, open || closing, closeMenu, restore)

  useEffect(() => {
    const dialog = ref.current
    if (!closing || !dialog) return
    let live = true
    // Only the finite ones: a looping pulse inside, as Next up's slot, would never finish.
    const ending = dialog.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().activeDuration !== Infinity)
    void Promise.allSettled(ending.map(a => a.finished)).then(() => live && dialog.close())
    return () => {
      live = false
    }
  }, [closing])

  useEffect(() => closeNow(), [pathname])

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
      data-closing={closing || undefined}
      onCancel={e => {
        e.preventDefault()
        closeMenu()
      }}
      onClose={() => {
        setClosing(false)
        closeMenu()
      }}
      onClick={e => {
        if ((e.target as Element).closest('a')) closeNow()
        else if (e.target === e.currentTarget) closeMenu()
      }}
    >
      {(open || closing) && <Contents />}
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
        <span>Pixel</span>&nbsp;Imperium
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
