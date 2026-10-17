import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useAccount } from './account.ts'
import { KeyCap } from './album/KeyCap.tsx'
import { AutoIcon, DayIcon, HomeIcon, NightIcon, PlayIcon, SoundIcon } from './album/icons.tsx'
import { useCurrentCampaign } from './campaign/last-campaign.ts'
import { type ContinueAt, campaignProgress, continueAt } from './campaign/progress.ts'
import { toggleMenu, useMenu } from './menu/menu-store.ts'
import { PadGlyph } from './pad/PadGlyph.tsx'
import { InviteSlip, PartySticker } from './party/PartySticker.tsx'
import { useEscapeUp } from './pad/PadProvider.tsx'
import { usePrefetch } from './play/prefetch.ts'
import { type Theme, updateSettings, useSettings } from './settings.ts'
import { sticker } from './Trail.tsx'
import app from './App.module.css'
import styles from './Hud.module.css'

export const themeLabel: Record<Theme, string> = { dark: 'Night', light: 'Day', auto: 'Auto' }
export const themeIcon: Record<Theme, ReactNode> = { dark: <NightIcon />, light: <DayIcon />, auto: <AutoIcon /> }

/** Pages whose Worlds columns run under the HUD, edge to edge; everywhere else it takes its own row. */
const floats = (pathname: string) =>
  /^\/(?:c\/[^/]+(?:\/[^/]+)?\/?|daily\/[^/]+\/[^/]+\/?|learn(?:\/[^/]+)?\/?|settings\/?|u\/[^/]+\/?|workshop(?:\/puzzles|\/c\/[^/]+\/(?:playtest\/)?[^/]+)?\/?)?$/.test(pathname)

/** The next puzzle in the campaign last shown, recomputed on every navigation since solves land between them. */
export function useContinue(): ContinueAt | null {
  const campaign = useCurrentCampaign()
  const { storage } = useAccount()
  useRouterState({ select: s => s.location.href })
  if (!campaign) return null
  return continueAt(campaign, campaignProgress(campaign, storage), id => storage.loadSolved(id) !== null)
}

/** The logo mark: a 9×6-cell pixel crown, drawn in cell units. Decorative. */
export function CrownMark({ className }: { className?: string | undefined }) {
  return (
    <svg className={`${styles.mark} ${className ?? ''}`} viewBox="0 0 9 6" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M0 0h1v1h1v1h1V1h1V0h1v1h1v1h1V1h1V0h1v5H0z" fill="var(--gold)" />
      <rect y="5" width="9" height="1" fill="var(--gold-dk)" />
      <path d="M1 3h1v1H1zM5 3h1v1H5z" fill="var(--pink)" />
      <path d="M3 3h1v1H3zM7 3h1v1H7z" fill="var(--cover)" />
    </svg>
  )
}

interface PillProps {
  className?: string | undefined
  /** The house-button `data-variant` and `data-size`. */
  variant?: 'flat' | undefined
  size?: 'compact' | undefined
}

export function SoundButton({ className, variant, size }: PillProps) {
  const { sound } = useSettings()
  return (
    <button
      type="button"
      className={className}
      data-variant={variant}
      data-size={size}
      data-on={sound || undefined}
      aria-label={sound ? 'Sound on. Turn it off.' : 'Sound off. Turn it on.'}
      title={sound ? 'Sound on' : 'Sound off'}
      onClick={() => updateSettings({ sound: !sound })}
    >
      <SoundIcon on={sound} />
    </button>
  )
}

/**
 * The crown sticker that summons the menu (`menu/MenuPanel.tsx`). `className` swaps the HUD's plate for a board's
 * own, as the filmstrip's; `children` captions it, as in the thumb bar.
 */
export function MenuCrown({ className, children }: { className?: string | undefined; children?: ReactNode }) {
  const { open } = useMenu()
  return (
    <button
      type="button"
      className={className ?? styles.crown}
      data-menu-crown
      data-pad-menu
      aria-label="Menu"
      aria-haspopup="dialog"
      aria-expanded={open}
      onClick={e => toggleMenu(e.currentTarget)}
    >
      <CrownMark />
      {children}
    </button>
  )
}

/**
 * M and the pad's Menu, beside the HUD's crown. Named, as the crown is, so the columns' morphing groups don't paint
 * over it. `corner` pins it to the corner of a board's own crown instead, wrapped with it in a `crownCorner`.
 */
export function MenuKeys({ corner = false }: { corner?: boolean }) {
  return (
    <span className={corner ? `${styles.cap} ${styles.capCorner}` : styles.cap} style={corner ? undefined : sticker('hud-keys', 0)}>
      <KeyCap>M</KeyCap>
      <PadGlyph button="Menu" />
    </span>
  )
}

function CrownSticker() {
  return (
    <>
      <span className={styles.holder} style={sticker('hud-logo', 0)}>
        <MenuCrown />
      </span>
      <MenuKeys />
    </>
  )
}

/**
 * The crown alone, laid over a board with no crown of its own where the floating HUD puts it, so it holds still
 * when a page with the HUD morphs into one.
 */
export function FloatingCrown() {
  return (
    <div className={`${styles.hud} ${styles.over}`}>
      <CrownSticker />
    </div>
  )
}

/** A board's own pills in the top-right corner, where a puzzle page keeps its party sticker. */
export function HudCorner({ children }: { children: ReactNode }) {
  return <div className={styles.corner}>{children}</div>
}

/**
 * The crown sticker top-left, then the party sticker and any invite slip. `float` lays it over the page instead of in
 * its own row; by default that follows the route. Mounted wherever the HUD shows, it's where Esc goes up a level.
 */
export function Hud({ float }: { float?: boolean | undefined }) {
  const pathname = useRouterState({ select: s => s.location.pathname })
  useEscapeUp()
  return (
    <header className={styles.hud} data-float={(float ?? floats(pathname)) || undefined}>
      <CrownSticker />
      <span className={styles.party} style={sticker('hud-party', 1)}>
        <PartySticker />
      </span>
      <InviteSlip className={styles.slip} />
    </header>
  )
}

/**
 * The phone's bottom bar, in place of the crown up top: Home, a raised Continue, and the party sticker and the crown,
 * whose menu rises over it. An invite slip rides above it. Hidden while playing and on wider screens.
 */
export function ThumbBar() {
  const next = useContinue()
  const playing = useRouterState({ select: s => /^\/(play|party)\//.test(s.location.pathname) })
  usePrefetch(playing ? null : next?.puzzle.id)
  if (playing) return null

  return (
    <nav className={app.thumbBar} aria-label="Main navigation" data-thumb-bar>
      <Link to="/" className={app.thumbItem}>
        <HomeIcon />
        Home
      </Link>
      {next ? (
        <Link
          to="/play/$id"
          params={{ id: next.puzzle.id }}
          className={app.fab}
          aria-label={next.fresh ? 'Start' : `Continue: #${next.number} ${next.puzzle.title}`}
        >
          <PlayIcon />
        </Link>
      ) : (
        <span />
      )}
      <span className={app.thumbEnd}>
        <PartySticker small />
        <MenuCrown className={`${app.thumbItem} ${app.thumbCrown}`}>Menu</MenuCrown>
        <InviteSlip className={app.thumbSlip} />
      </span>
    </nav>
  )
}
