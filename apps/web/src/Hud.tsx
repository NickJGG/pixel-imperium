import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useAccount } from './account.ts'
import { AccountMenu, ThumbMenu } from './AccountMenu.tsx'
import { AutoIcon, DayIcon, HomeIcon, NightIcon, PlayIcon, ProfileIcon, SoundIcon } from './album/icons.tsx'
import { useCurrentCampaign } from './campaign/last-campaign.ts'
import { homeMorph, isProvincePath } from './campaign/worlds/Worlds.tsx'
import { type ContinueAt, campaignProgress, continueAt } from './campaign/progress.ts'
import { type Theme, updateSettings, useSettings } from './settings.ts'
import app from './App.module.css'
import styles from './Hud.module.css'

const nextTheme: Record<Theme, Theme> = { dark: 'light', light: 'auto', auto: 'dark' }
const themeLabel: Record<Theme, string> = { dark: 'Night', light: 'Day', auto: 'Auto' }
const themeIcon: Record<Theme, ReactNode> = { dark: <NightIcon />, light: <DayIcon />, auto: <AutoIcon /> }

/** Pages whose Worlds columns run under the HUD, edge to edge; everywhere else it takes its own row. */
const floats = (pathname: string) => /^\/(?:c\/[^/]+(?:\/[^/]+)?\/?|learn\/?|settings\/?|u\/[^/]+\/?)?$/.test(pathname)

/** The next puzzle in the campaign last shown, recomputed on every navigation since solves land between them. */
function useContinue(): ContinueAt | null {
  const campaign = useCurrentCampaign()
  const { storage } = useAccount()
  useRouterState({ select: s => s.location.href })
  if (!campaign) return null
  return continueAt(campaign, campaignProgress(campaign, storage), id => storage.loadSolved(id) !== null)
}

/** The logo mark: a 9×6-cell pixel crown, drawn in cell units. Decorative. */
export function CrownMark({ className }: { className?: string | undefined }) {
  return (
    <svg className={className} viewBox="0 0 9 6" shapeRendering="crispEdges" aria-hidden="true">
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
      aria-label={sound ? 'Sound on. Turn it off.' : 'Sound off. Turn it on.'}
      onClick={() => updateSettings({ sound: !sound })}
    >
      <SoundIcon on={sound} />
    </button>
  )
}

export function ThemeButton({ className, variant, size }: PillProps) {
  const { theme } = useSettings()
  return (
    <button
      type="button"
      className={className}
      data-variant={variant}
      data-size={size}
      aria-label={`Theme: ${themeLabel[theme]}. Switch to ${themeLabel[nextTheme[theme]]}.`}
      onClick={() => updateSettings({ theme: nextTheme[theme] })}
    >
      {themeIcon[theme]}
    </button>
  )
}

/** Sound, theme and the account, every pill one style: the HUD's top-right, and the top of Play's rail. */
export function HudPills({ className }: { className?: string | undefined }) {
  return (
    <span className={className ? `${styles.tools} ${className}` : styles.tools}>
      <SoundButton className={styles.round} />
      <ThemeButton className={styles.round} />
      <span className={styles.account}>
        <AccountMenu />
      </span>
    </span>
  )
}

/**
 * The logo sticker top-left and the pills top-right. `float` lays it over the page instead of in its own
 * row; by default that follows the route. On a phone only sound and theme stay: the thumb bar has the rest.
 */
export function Hud({ float }: { float?: boolean }) {
  const pathname = useRouterState({ select: s => s.location.pathname })
  return (
    <header className={styles.hud} data-float={(float ?? floats(pathname)) || undefined}>
      <Link to="/" viewTransition={isProvincePath(pathname) && homeMorph('home')} className={styles.logo}>
        <CrownMark className={styles.mark} />
        <span className={styles.wordmark}>
          <span>Pixel</span> Imperium
        </span>
      </Link>
      <HudPills className={styles.pagePills} />
    </header>
  )
}

/**
 * The phone's bottom bar: Home, a raised Continue, and Profile, whose menu holds the account.
 * Hidden while playing and on wider screens.
 */
export function ThumbBar() {
  const next = useContinue()
  const playing = useRouterState({ select: s => s.location.pathname.startsWith('/play/') })
  if (playing) return null

  return (
    <nav className={app.thumbBar} aria-label="Main navigation">
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
      <ThumbMenu
        trigger={
          <>
            <ProfileIcon />
            Profile
          </>
        }
        triggerClassName={app.thumbItem}
      />
    </nav>
  )
}
