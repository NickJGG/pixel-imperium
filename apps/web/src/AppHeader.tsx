import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { type Theme, updateSettings, useSettings } from './settings.ts'
import styles from './App.module.css'

const nextTheme: Record<Theme, Theme> = { auto: 'light', light: 'dark', dark: 'auto' }
const themeLabel: Record<Theme, string> = { auto: 'Auto', light: 'Light', dark: 'Dark' }

const themeIcon: Record<Theme, ReactNode> = {
  auto: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
    </svg>
  ),
  light: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  ),
}

export function AppHeader() {
  const { theme } = useSettings()
  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand}>
        <span className={styles.pixels} aria-hidden="true" />
        Pixel Imperium
      </Link>
      <button
        type="button"
        aria-label={`Theme: ${themeLabel[theme]}. Switch to ${themeLabel[nextTheme[theme]]}.`}
        onClick={() => updateSettings({ theme: nextTheme[theme] })}
      >
        {themeIcon[theme]}
        <span className={styles.themeLabel}>{themeLabel[theme]}</span>
      </button>
    </header>
  )
}
