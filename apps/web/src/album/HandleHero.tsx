import { Fragment } from 'react'
import styles from './HandleHero.module.css'

/** Past this many characters a handle drops from hero to title size. */
const LONG = 10

/** A player's `@handle` as a page's hero, preferring to break after an underscore. */
export function HandleHero({ handle, id }: { handle: string; id?: string | undefined }) {
  const parts = handle.split('_')
  return (
    <h1 id={id} className={styles.hero} data-long={handle.length > LONG || undefined}>
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
    </h1>
  )
}
