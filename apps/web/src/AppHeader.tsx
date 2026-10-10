import type { ReactNode } from 'react'
import { Link, useRouterState } from '@tanstack/react-router'
import { useAccount } from './account.ts'
import { AccountMenu, SignInMenu } from './AccountMenu.tsx'
import { AlbumIcon, AutoIcon, DayIcon, NightIcon, PlayIcon, ProfileIcon, SoundIcon } from './album/icons.tsx'
import { useCurrentCampaign } from './campaign/last-campaign.ts'
import { type ContinueAt, campaignProgress, continueAt } from './campaign/progress.ts'
import { setPlaySlot } from './playSlot.ts'
import { type Theme, updateSettings, useSettings } from './settings.ts'
import styles from './App.module.css'

const nextTheme: Record<Theme, Theme> = { dark: 'light', light: 'auto', auto: 'dark' }
const themeLabel: Record<Theme, string> = { dark: 'Night', light: 'Day', auto: 'Auto' }
const themeIcon: Record<Theme, ReactNode> = { dark: <NightIcon />, light: <DayIcon />, auto: <AutoIcon /> }

/** The next puzzle in the campaign last shown, recomputed on every navigation since solves land between them. */
function useContinue(): ContinueAt | null {
  const campaign = useCurrentCampaign()
  const { storage } = useAccount()
  useRouterState({ select: s => s.location.href })
  if (!campaign) return null
  return continueAt(campaign, campaignProgress(campaign, storage), id => storage.loadSolved(id) !== null)
}

/** The logo mark: a 9×6-cell pixel crown, drawn in cell units. Decorative. */
function CrownMark() {
  return (
    <svg className={styles.mark} viewBox="0 0 9 6" shapeRendering="crispEdges" aria-hidden="true">
      <path d="M0 0h1v1h1v1h1V1h1V0h1v1h1v1h1V1h1V0h1v5H0z" fill="var(--gold)" />
      <rect y="5" width="9" height="1" fill="var(--gold-dk)" />
      <path d="M1 3h1v1H1zM5 3h1v1H5z" fill="var(--pink)" />
      <path d="M3 3h1v1H3zM7 3h1v1H7z" fill="var(--cover)" />
    </svg>
  )
}

/**
 * The cobalt spine bar across the top. On phones it compacts and Continue moves to the `ThumbBar`.
 * On /play it slims, and PlayPage fills its puzzle slot with the way back and the puzzle.
 */
export function AppHeader() {
  const { theme, sound } = useSettings()
  const next = useContinue()
  const playing = useRouterState({ select: s => s.location.pathname.startsWith('/play/') })
  return (
    <header className={styles.spine} data-playing={playing || undefined}>
      <Link to="/" className={styles.logo}>
        <CrownMark />
        <span className={styles.wordmark}>
          <span>Pixel</span> Imperium
        </span>
      </Link>
      {playing && <span ref={setPlaySlot} className={styles.puzzle} />}
      {next && !playing && (
        <span className={styles.continue}>
          <span className={styles.nextUp}>
            {next.fresh ? (
              `Your album starts in ${next.province.name}`
            ) : (
              <>
                Next up: #{next.number} {next.puzzle.title}
              </>
            )}
          </span>
          <Link to="/play/$id" params={{ id: next.puzzle.id }} className={styles.pill}>
            {next.fresh ? 'Start' : 'Continue'}
          </Link>
        </span>
      )}
      <span className={styles.tools}>
        <button
          type="button"
          className={styles.round}
          aria-label={sound ? 'Sound on. Turn it off.' : 'Sound off. Turn it on.'}
          aria-pressed={sound}
          onClick={() => updateSettings({ sound: !sound })}
        >
          <SoundIcon on={sound} />
        </button>
        <button
          type="button"
          className={styles.round}
          aria-label={`Theme: ${themeLabel[theme]}. Switch to ${themeLabel[nextTheme[theme]]}.`}
          onClick={() => updateSettings({ theme: nextTheme[theme] })}
        >
          {themeIcon[theme]}
        </button>
        <AccountMenu />
      </span>
    </header>
  )
}

/** The phone's bottom bar: Album, a raised Continue, and Profile. Hidden while playing and on wider screens. */
export function ThumbBar() {
  const next = useContinue()
  const { account } = useAccount()
  const playing = useRouterState({ select: s => s.location.pathname.startsWith('/play/') })
  if (playing) return null

  return (
    <nav className={styles.thumbBar} aria-label="Album navigation">
      <Link to="/" className={styles.thumbItem}>
        <AlbumIcon />
        Album
      </Link>
      {next ? (
        <Link
          to="/play/$id"
          params={{ id: next.puzzle.id }}
          className={styles.fab}
          aria-label={next.fresh ? 'Start' : `Continue: #${next.number} ${next.puzzle.title}`}
        >
          <PlayIcon />
        </Link>
      ) : (
        <span />
      )}
      {account ? (
        <Link to="/u/$handle" params={{ handle: account.handle }} className={styles.thumbItem}>
          <ProfileIcon />
          Profile
        </Link>
      ) : (
        <SignInMenu
          up
          trigger={
            <>
              <ProfileIcon />
              Profile
            </>
          }
          triggerClassName={styles.thumbItem}
        />
      )}
    </nav>
  )
}
