import { Link } from '@tanstack/react-router'

/** Opens the Tutorial, which hands back to `back` when it's done or skipped. */
export function HowToPlay({ back, className }: { back: string; className: string | undefined }) {
  return (
    <Link to="/learn" search={{ back }} className={className}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.01" />
      </svg>
      How to play
    </Link>
  )
}
