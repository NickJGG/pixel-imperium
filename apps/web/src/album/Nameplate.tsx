import styles from './Nameplate.module.css'

/** The label on the album's cover naming its owner. Always printed in Day colors: it's a white sticker. */
export function Nameplate({ handle, className }: { handle: string; className?: string | undefined }) {
  return (
    <span className={[styles.nameplate, className].filter(Boolean).join(' ')}>
      <small>This album belongs to</small>
      <b>@{handle}</b>
    </span>
  )
}
