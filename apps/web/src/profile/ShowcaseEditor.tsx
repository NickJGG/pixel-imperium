import { useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { putShowcase } from '../api.ts'
import { useAccount } from '../account.ts'
import { SHOWCASE_SIZE, type StickerEntry } from '../campaign/stickers.ts'
import { ProfileSticker } from './Showcase.tsx'
import styles from './Profile.module.css'

interface Props {
  /** The player's own verified stickers, latest first. */
  stickers: StickerEntry[]
  picks: string[]
  onChange(picks: string[]): void
  onClose(): void
}

/** Picks up to three of your stickers for your cover, in order; the cover previews them as you tap. */
export function ShowcaseEditor({ stickers, picks, onChange, onClose }: Props) {
  const router = useRouter()
  const { storage } = useAccount()
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle')
  const full = picks.length >= SHOWCASE_SIZE

  const toggle = (id: string) => onChange(picks.includes(id) ? picks.filter(p => p !== id) : [...picks, id])

  async function save() {
    setStatus('saving')
    try {
      const { puzzleIds } = await putShowcase(picks)
      storage.saveShowcase(puzzleIds)
      await router.invalidate()
      onClose()
    } catch {
      setStatus('failed')
    }
  }

  return (
    <>
      <h2 id="showcase-edit-title" className={styles.kicker}>
        Edit showcase · {stickers.length} {stickers.length === 1 ? 'sticker' : 'stickers'}
      </h2>
      <p className={styles.hint}>
        Tap up to {SHOWCASE_SIZE} stickers. The first is the big one on your cover; with none picked, your latest
        stickers show instead.
      </p>
      <ul className={styles.picker}>
        {stickers.map(s => {
          const at = picks.indexOf(s.puzzle.id)
          return (
            <li key={s.puzzle.id}>
              <button
                type="button"
                className={styles.pick}
                data-variant="flat"
                aria-pressed={at !== -1}
                aria-label={`#${s.number} ${s.puzzle.title}${at === -1 ? '' : `, pick ${at + 1}`}`}
                disabled={at === -1 && full}
                onClick={() => toggle(s.puzzle.id)}
              >
                <ProfileSticker sticker={s} />
                {at !== -1 && (
                  <span className={styles.order} aria-hidden="true">
                    {at + 1}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {status === 'failed' && (
        <p className={styles.hint} role="alert">
          Couldn't save the showcase. Try again.
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" data-variant="primary" disabled={status === 'saving'} onClick={() => void save()}>
          {status === 'saving' ? 'Saving…' : 'Save showcase'}
        </button>
        <button type="button" data-variant="ghost" onClick={onClose}>
          Cancel
        </button>
      </div>
    </>
  )
}
