import type { ReactNode } from 'react'

/** A 24-unit stroked line icon, sized to the surrounding text (1em) unless CSS says otherwise. Decorative. */
function Icon({ children, filled }: { children: ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const SoundIcon = ({ on }: { on: boolean }) => (
  <Icon>
    <path d="M4 9v6h4l5 4V5L8 9z" />
    {on ? <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="M17 9l5 6M22 9l-5 6" />}
  </Icon>
)

export const NightIcon = () => (
  <Icon>
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </Icon>
)

export const DayIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </Icon>
)

export const AutoIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" />
  </Icon>
)

export const AlbumIcon = () => (
  <Icon>
    <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" />
    <path d="M4 21V5M9 7h6" />
  </Icon>
)

export const PlayIcon = () => (
  <Icon filled>
    <path d="M8 5l11 7-11 7z" />
  </Icon>
)

export const ProfileIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </Icon>
)

export const SettingsIcon = () => (
  <Icon>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" />
  </Icon>
)

export const SignOutIcon = () => (
  <Icon>
    <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10" />
  </Icon>
)

export const LearnIcon = () => (
  <Icon>
    <path d="M2 9l10-5 10 5-10 5z" />
    <path d="M6 11v5c3 2.5 9 2.5 12 0v-5M22 9v5" />
  </Icon>
)

export const CheckIcon = () => (
  <Icon>
    <path d="M4.5 12.5l5 5L20 7" />
  </Icon>
)

export const StickerIcon = () => (
  <Icon>
    <rect x="4" y="4" width="16" height="16" rx="3" />
    <path d="M14 20v-3a3 3 0 0 1 3-3h3" />
  </Icon>
)

export const SparkleIcon = () => (
  <Icon>
    <path d="M12 3c.8 4.5 4.5 8.2 9 9-4.5.8-8.2 4.5-9 9-.8-4.5-4.5-8.2-9-9 4.5-.8 8.2-4.5 9-9z" />
  </Icon>
)

export const FlameIcon = () => (
  <Icon>
    <path d="M12 21c-4 0-6.5-2.7-6.5-6.2 0-3.3 2.4-5.4 4-7.8.6 1.9 1.6 3 2.8 3.5C12.6 7.6 13.5 5 15.5 3c.7 3.4 3 5.8 3 10.2 0 4.3-2.5 7.8-6.5 7.8z" />
  </Icon>
)

export const BoltIcon = () => (
  <Icon>
    <path d="M13 3L5 13.5h6L10 21l8-10.5h-6z" />
  </Icon>
)

export const PageStarIcon = () => (
  <Icon>
    <path d="M6 3h9l4 4v14H6z" />
    <path d="M12.5 10.5l1.1 2.2 2.4.4-1.7 1.7.4 2.4-2.2-1.1-2.2 1.1.4-2.4-1.7-1.7 2.4-.4z" />
  </Icon>
)

export const CrownIcon = () => (
  <Icon>
    <path d="M4 18L3 7.5l5 4 4-7 4 7 5-4L20 18z" />
    <path d="M4 21h16" />
  </Icon>
)
