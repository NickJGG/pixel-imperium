import { type ReactNode, useId } from 'react'
import { Link, useRouter } from '@tanstack/react-router'
import type { Paper } from './album/paper.ts'
import { useAccount } from './account.ts'
import { World, Worlds } from './campaign/worlds/Worlds.tsx'
import styles from './EdgeStates.module.css'

/** A page that can't be shown: one column in `paper`, its words on the left and a big empty slot holding `mark`. */
export function EdgeState({
  paper,
  kicker,
  title,
  mark,
  children,
  actions,
}: {
  paper: Paper
  kicker: string
  title: string
  mark: ReactNode
  children: ReactNode
  actions: ReactNode
}) {
  const id = useId()
  return (
    <main className={styles.page} data-edge>
      <Worlds>
        <World paper={paper} labelledBy={id}>
          <div className={styles.split}>
            <div className={styles.column}>
              <p className={styles.kicker}>{kicker}</p>
              <h1 id={id} className={styles.title}>
                {title}
              </h1>
              {children}
              <div className={styles.actions}>{actions}</div>
            </div>
            <div className={styles.mark} aria-hidden="true">
              <b>{mark}</b>
            </div>
          </div>
        </World>
      </Worlds>
    </main>
  )
}

/** A missing campaign, province, puzzle, player or page, with the way back. */
export function NotFound({ children }: { children: ReactNode }) {
  return (
    <EdgeState
      paper="forge"
      kicker="404"
      title="Nothing here"
      mark="?"
      actions={
        <Link to="/" data-variant="primary" data-pad-default>
          Back home
        </Link>
      }
    >
      <p>{children}</p>
    </EdgeState>
  )
}

export function LoadError({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <EdgeState
      paper="throne"
      kicker="Error"
      title="Couldn’t load this"
      mark="!"
      actions={
        <button type="button" data-variant="primary" data-pad-default onClick={() => void router.invalidate()}>
          Try again
        </button>
      }
    >
      <p>We couldn’t load this page. Your stickers are safe on this device.</p>
      <p className={styles.detail}>{error instanceof Error ? error.message : String(error)}</p>
    </EdgeState>
  )
}

/** The Workshop's page: a plain string, since its route isn't registered yet. */
export const WORKSHOP: string = '/workshop'

/** Player-made work its Author retired before this player started it. */
export function Retired({ what, author }: { what: 'puzzle' | 'campaign'; author: string }) {
  const { account } = useAccount()
  return (
    <EdgeState
      paper="workshop"
      kicker="Retired"
      title={`@${author} retired this ${what}`}
      mark="✕"
      actions={
        <>
          <Link to="/" data-variant="primary" data-pad-default>
            Back home
          </Link>
          {account && (
            <Link to={WORKSHOP} data-variant="paper">
              Open the Workshop
            </Link>
          )}
        </>
      }
    >
      <p>Only players who started it can still play it.</p>
    </EdgeState>
  )
}
