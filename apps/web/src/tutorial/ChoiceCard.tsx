import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import type { Province } from '@pixel-imperium/protocol'
import { Dymo } from '../album/Dymo.tsx'
import { usePadContain } from '../pad/PadProvider.tsx'
import { asked } from './asked.ts'
import type { Track } from './tracks.ts'
import styles from './Lesson.module.css'

export interface OfferCopy {
  tag: string
  tone?: 'dark' | 'pink'
  heading: string
  text: string
  /** Lists the track's Lessons as chips. */
  chips?: true
  learn: string
  decline: string
  footer?: string
}

export const TUTORIAL_OFFER: OfferCopy = {
  tag: 'First puzzle',
  heading: 'New to nonograms?',
  text: 'The clues tell you which cells to fill. Four tiny lessons show you how. It takes about two minutes.',
  learn: 'Learn in 2 minutes',
  decline: 'I know how to play',
}

export const techniquesOffer = (province: Province): OfferCopy => ({
  tag: province.name,
  tone: 'pink',
  heading: 'Bigger pictures ahead',
  text: `From here the grids reach ${province.maxSize}×${province.maxSize}, and the basics alone get slow. Five short lessons show the tricks that keep them moving.`,
  chips: true,
  learn: 'Learn the techniques',
  decline: 'Not now',
  footer: "They're always in How to play.",
})

/**
 * Offers `track` over a puzzle, holding focus until answered. Learn, the decline button, ✕ and Escape
 * all count as asked, which is what takes the card away.
 */
/** `back` is the puzzle's page, where the track hands back to. */
export function ChoiceCard({ track, copy, back }: { track: Track; copy: OfferCopy; back: string }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const learnRef = useRef<HTMLAnchorElement>(null)
  const { mark } = asked(track.id)
  usePadContain(cardRef, true, mark)

  useEffect(() => {
    learnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return mark()
      if (e.key !== 'Tab') return
      const items = [...cardRef.current!.querySelectorAll<HTMLElement>('a, button')]
      const at = items.indexOf(document.activeElement as HTMLElement)
      const to = at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length
      e.preventDefault()
      items[to]!.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mark])

  return (
    <div className={styles.overlay}>
      <div ref={cardRef} className={styles.choice} role="dialog" aria-modal="true" aria-labelledby="choice-title">
        <button type="button" data-variant="ghost" className={styles.close} aria-label="Close" onClick={mark}>
          ✕
        </button>
        <Dymo tone={copy.tone ?? 'dark'} className={styles.choiceTag}>
          {copy.tag}
        </Dymo>
        <h2 id="choice-title">{copy.heading}</h2>
        <p>{copy.text}</p>
        {copy.chips && (
          <ul className={styles.chips}>
            {track.lessons.map(l => (
              <li key={l.id}>{l.title}</li>
            ))}
          </ul>
        )}
        <Link
          ref={learnRef}
          to="/learn/$track/$lesson"
          params={{ track: track.id, lesson: track.lessons[0]!.id }}
          search={{ back }}
          className={styles.learn}
          data-variant="primary"
          onClick={mark}
        >
          {copy.learn}
        </Link>
        <button type="button" data-variant="chip" onClick={mark}>
          {copy.decline}
        </button>
        {copy.footer && <p className={styles.choiceFoot}>{copy.footer}</p>}
      </div>
    </div>
  )
}
