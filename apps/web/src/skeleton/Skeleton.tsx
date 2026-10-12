/**
 * A page's stand-in while it loads, in the page's own layout: `Bar`s where text, pills and buttons will be, under
 * one sweep across the window, and `Ghost`s, the empty slot's dashed outline, where slots, stickers and art will be.
 * Copy from the code or the URL renders for real; anything from the campaign, progress or account is a block.
 */
import type { CSSProperties } from 'react'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import styles from './Skeleton.module.css'

export function Bar({
  w,
  h,
  pill = false,
  style,
}: {
  w?: number | string
  h: number | string
  /** A count pill or a button's shape. */
  pill?: boolean
  style?: CSSProperties
}) {
  return (
    <span
      className={styles.bar}
      style={{ width: w, height: h, ...style }}
      data-pill={pill || undefined}
      aria-hidden="true"
    />
  )
}

export function Ghost({ style, round = false }: { style?: CSSProperties; round?: boolean }) {
  return <span className={styles.ghost} style={style} data-round={round || undefined} aria-hidden="true" />
}

export function SrLoading() {
  return <p className={styles.srOnly}>Loading…</p>
}

/** Any page without its own skeleton: one bare column in the fog. */
export function Fallback() {
  return (
    <main className={styles.page} aria-busy="true">
      <SrLoading />
      <Worlds>
        <World index={0} fog />
      </Worlds>
    </main>
  )
}
