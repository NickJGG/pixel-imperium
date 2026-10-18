import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { PARTY_SEATS } from '@pixel-imperium/protocol'
import { SignInMenu } from '../AccountMenu.tsx'
import { ProfileIcon, SettingsIcon } from '../album/icons.tsx'
import { type Paper, paperFor } from '../album/paper.ts'
import { useAccount } from '../account.ts'
import { useSession } from '../auth.ts'
import { NextUpCard } from '../campaign/NextUpCard.tsx'
import { SpineButton, World, Worlds, usePhone, useSpineReach } from '../campaign/worlds/Worlds.tsx'
import { CrownMark, SoundButton, themeIcon, themeLabel, useContinue } from '../Hud.tsx'
import { usePadContain } from '../pad/PadProvider.tsx'
import { currentScope } from '../pad/spatial.ts'
import { Faces } from '../party/PartyCard.tsx'
import { usePartyView } from '../party/party-store.ts'
import { usePrefetch } from '../play/prefetch.ts'
import { type Theme, updateSettings, useSettings } from '../settings.ts'
import { Trail } from '../Trail.tsx'
import { FriendsColumn } from './FriendsColumn.tsx'
import { MENU_COLUMNS, type MenuColumn, closeMenu, openMenu, takeLanding, toggleMenu, useBoard, useMenu } from './menu-store.ts'
import { PartyColumn } from './PartyColumn.tsx'
import { goToColumn, stepMenu } from './step.ts'
import app from '../App.module.css'
import hud from '../Hud.module.css'
import styles from './Menu.module.css'

const THEMES: readonly Theme[] = ['dark', 'light', 'auto']

const NAMES: Record<MenuColumn, string> = { menu: 'Menu', friends: 'Friends', party: 'Party' }
/** Menu's lies under its cobalt (`.cover`), as Home's Profile column's does. */
const PAPERS: Record<MenuColumn, Paper> = { menu: 'marches', friends: 'spring', party: 'throne' }

/** Pairs a column across a step, wide when it's open and a spine when it isn't. */
const columnName = (column: MenuColumn): CSSProperties => ({ viewTransitionName: `menu-${column}` })

/**
 * Pins the panel's crown over the one that opened it, or the first one showing, so the crown seems to hold still
 * while the panel opens around it. Without one, the panel's own defaults put it where the HUD's sits.
 */
function pinCrown(dialog: HTMLDialogElement, opener: HTMLElement | null): void {
  const crown =
    (opener?.isConnected && opener.matches('[data-menu-crown]') && opener) ||
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

/** Menu's own focus, else its footer's first; a paper column's first control. */
function focusColumn(dialog: HTMLDialogElement): void {
  const first =
    dialog.querySelector<HTMLElement>(`.${styles.open} [data-menu-focus]`) ??
    dialog.querySelector<HTMLElement>(`.${styles.open} .${styles.foot} :is(a, button)`) ??
    dialog.querySelector<HTMLElement>(`.${styles.sheet}.${styles.open} :is(input, a[href], button:not(:disabled))`)
  first?.focus()
}

/** Once the dialog's running animations are done; only the finite ones, as a looping pulse in Next up's slot never is. */
function settled(dialog: HTMLDialogElement): Promise<unknown> {
  const ending = dialog.getAnimations({ subtree: true }).filter(a => a.effect?.getComputedTiming().activeDuration !== Infinity)
  return Promise.allSettled(ending.map(a => a.finished))
}

/** On a phone, the sheet stands on the thumb bar, where there is one. */
function seatSheet(dialog: HTMLDialogElement): void {
  const bar = document.querySelector<HTMLElement>('[data-thumb-bar]')
  const bottom = bar?.checkVisibility() ? innerHeight - bar.getBoundingClientRect().top : 0
  dialog.style.setProperty('--sheet-bottom', `${bottom}px`)
}

/**
 * Numbers the open column's stickers in reading order (the trail's, the card and the footer's, or a paper column's
 * rows), so they pop off in turn on closing, and on opening (`enter`) slap on in turn; a step's arrive with their column.
 */
function stagger(dialog: HTMLDialogElement, enter: boolean): void {
  const stickers = dialog.querySelectorAll<HTMLElement>(
    `.${styles.open} nav a, .${styles.nextUp}, .${styles.foot} > :not(.${styles.gap}), .${styles.sheet}.${styles.open} section > *`,
  )
  stickers.forEach((el, i) => {
    el.classList.add(`${styles.sticker}`)
    if (enter) el.classList.add(`${styles.slap}`)
    el.style.setProperty('--i', String(i))
  })
  dialog.style.setProperty('--n', String(stickers.length))
}

/**
 * The menu any crown or party sticker summons, over the dimmed page: three slanted columns, one open and the others
 * folded to spines. Menu (the cobalt) holds the crown and wordmark, the trail, the puzzle due next, and a footer of
 * the player and the settings; Friends and Party wear papers of their own. They're Worlds, and step as Home's columns
 * do, by a spine, ←/→, LB/RB or the keys under the spines (`step.ts`). Mounted once at the root; `menu-store.ts`
 * holds whether it's open and on which column. M opens and closes it anywhere, Esc or B closes it, as do the crown,
 * the dimmed page and any link inside. It wipes open and its stickers slap on (`Menu.module.css`); closing plays that
 * back and only then closes the dialog, except for a navigation, which closes it at once so the page's morph never
 * captures it. On a phone it rises as a sheet instead, the columns as tabs along its top.
 */
export function MenuPanel() {
  const { open, opener, column } = useMenu()
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
      stagger(dialog, true)
      dialog.showModal()
      focusColumn(dialog)
      dialog.dataset.opening = ''
      void settled(dialog).then(() => delete dialog.dataset.opening)
    } else if (dialog.open) {
      setClosing(true)
    }
  }, [open, opener])
  usePadContain(ref, open || closing, closeMenu, restore, stepMenu)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if ((e.target as HTMLElement).closest?.('input, textarea, select, [contenteditable]')) return
      if (currentScope() !== ref.current) return
      e.preventDefault()
      stepMenu(e.key === 'ArrowLeft' ? -1 : 1)
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    const dialog = ref.current
    if (!closing || !dialog) return
    let live = true
    void settled(dialog).then(() => live && dialog.close())
    return () => {
      live = false
    }
  }, [closing])

  useEffect(() => {
    const landing = takeLanding(pathname)
    if (landing) openMenu(null, landing)
    else closeNow()
  }, [pathname])

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
      data-col={column}
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
  const { column } = useMenu()
  const phone = usePhone()
  const ref = useRef<HTMLDivElement>(null)
  const shown = useRef(column)
  useSpineReach(ref)
  useLayoutEffect(() => {
    const dialog = ref.current?.closest('dialog')
    if (!dialog || shown.current === column) return
    shown.current = column
    stagger(dialog, false)
    focusColumn(dialog)
  }, [column])

  const wide = (c: MenuColumn) => (
    <World
      key={c}
      paper={PAPERS[c]}
      className={[styles.col, styles.open, c === 'menu' ? styles.cover : styles.sheet].join(' ')}
      style={columnName(c)}
    >
      {c === 'menu' ? (
        <div className={styles.surface} data-surface="cobalt">
          <MenuContents />
        </div>
      ) : c === 'friends' ? (
        <FriendsColumn />
      ) : (
        <PartyColumn />
      )}
    </World>
  )

  return (
    <>
      <span className={styles.crownHolder}>
        <button type="button" className={`${hud.crown} ${styles.crown}`} aria-label="Close menu" onClick={closeMenu}>
          <CrownMark />
        </button>
      </span>
      {column === 'menu' && (
        <Link to="/" className={styles.wordmark}>
          <span>Pixel</span>&nbsp;Imperium
        </Link>
      )}
      <Tabs column={column} />
      <div ref={ref} className={styles.columns}>
        {phone ? (
          wide(column)
        ) : (
          <Worlds className={styles.row} step={stepMenu}>
            {MENU_COLUMNS.map(c =>
              c === column ? (
                wide(c)
              ) : (
                <SpineButton
                  key={c}
                  name={NAMES[c]}
                  onClick={() => goToColumn(c)}
                  className={[styles.col, styles.folded, c === 'menu' && styles.cover].filter(Boolean).join(' ')}
                  style={{ ...paperFor(PAPERS[c]), ...columnName(c) }}
                >
                  <Badge column={c} />
                </SpineButton>
              ),
            )}
          </Worlds>
        )}
      </div>
    </>
  )
}

function MenuContents() {
  return (
    <>
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
    </>
  )
}

/** Friends online, or the Party's faces and seats taken ("+" in none), on a spine or a phone's tab. */
function Badge({ column, tab = false }: { column: MenuColumn; tab?: boolean }) {
  const { account } = useAccount()
  const view = usePartyView()
  if (column === 'friends') {
    const online = account ? view.friends.filter(f => f.online).length : 0
    return online > 0 ? (
      <span className={styles.badge}>
        <i className={styles.on} aria-hidden="true" />
        {online}
        <span className={styles.srOnly}> online</span>
      </span>
    ) : null
  }
  if (column !== 'party') return null
  const current = view.party
  if (!current) return tab ? null : <span className={styles.badge} aria-hidden="true">+</span>
  return (
    <span className={styles.badge}>
      <span className={styles.faces}>
        <Faces seats={current.seats} />
      </span>
      {!tab && (
        <b>
          {current.seats.length}/{PARTY_SEATS}
        </b>
      )}
    </span>
  )
}

/** On a phone, the columns as tabs along the sheet's top. */
function Tabs({ column }: { column: MenuColumn }) {
  return (
    <div className={styles.tabs} role="group" aria-label="Menu columns">
      {MENU_COLUMNS.map(c => (
        <button key={c} type="button" data-size="compact" aria-pressed={c === column} onClick={() => goToColumn(c)}>
          {NAMES[c]}
          <Badge column={c} tab />
        </button>
      ))}
    </div>
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
