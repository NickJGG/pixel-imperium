import { Fragment } from 'react'
import styles from './HandleHero.module.css'

/** Past this many characters a handle drops from hero to title size. */
const LONG = 10

/** A player's `@handle` as a page's hero, preferring to break after an underscore. */
export function HandleHero({ handle, id, as: Heading = 'h1' }: { handle: string; id?: string | undefined; as?: 'h1' | 'h2' }) {
  const parts = handle.split('_')
  return (
    <Heading id={id} className={styles.hero} data-long={handle.length > LONG || undefined}>
      @
      {parts.map((part, i) => (
        <Fragment key={i}>
          {part}
          {i < parts.length - 1 && (
            <>
              _<wbr />
            </>
          )}
        </Fragment>
      ))}
    </Heading>
  )
}
