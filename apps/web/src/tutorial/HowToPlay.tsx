import { Link } from '@tanstack/react-router'
import { TRACKS, type Track } from './tracks.ts'

/** Opens a track (the Tutorial unless told), which hands back to `back` when it's done or skipped. */
export function HowToPlay({
  back,
  className,
  track = TRACKS.tutorial,
}: {
  back: string
  className: string | undefined
  track?: Track
}) {
  return (
    <Link to={track.path} search={{ back }} className={className}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {track.id === 'tutorial' ? (
          <>
            <circle cx="12" cy="12" r="9" />
            <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" />
          </>
        ) : (
          <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z" />
        )}
      </svg>
      {track.label}
    </Link>
  )
}
