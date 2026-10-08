import { useEffect, useRef } from 'react'
import { Link } from '@tanstack/react-router'
import { Dymo } from '../album/Dymo.tsx'
import { markAsked } from './asked.ts'
import playStyles from '../play/Play.module.css'
import styles from './Lesson.module.css'

/**
 * Offers the Tutorial over a never-asked player's first puzzle, holding focus until answered. Learn, I know
 * how to play, ✕ and Escape all count as asked, which is what takes the card away.
 */
export function ChoiceCard({ puzzleId }: { puzzleId: string }) {
  const cardRef = useRef<HTMLDivElement>(null)
  const learnRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    learnRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return markAsked()
      if (e.key !== 'Tab') return
      const items = [...cardRef.current!.querySelectorAll<HTMLElement>('a, button')]
      const at = items.indexOf(document.activeElement as HTMLElement)
      const to = at === -1 ? 0 : (at + (e.shiftKey ? -1 : 1) + items.length) % items.length
      e.preventDefault()
      items[to]!.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className={styles.overlay}>
      <div ref={cardRef} className={styles.choice} role="dialog" aria-modal="true" aria-labelledby="choice-title">
        <button type="button" data-variant="ghost" className={styles.close} aria-label="Close" onClick={markAsked}>
          ✕
        </button>
        <Dymo className={styles.choiceTag}>First puzzle</Dymo>
        <h2 id="choice-title">New to nonograms?</h2>
        <p>The clues tell you which cells to fill. Four tiny lessons show you how. It takes about two minutes.</p>
        <Link
          ref={learnRef}
          to="/learn"
          search={{ back: `/play/${puzzleId}` }}
          className={`${playStyles.linkButton} ${styles.learn}`}
          onClick={markAsked}
        >
          Learn in 2 minutes
        </Link>
        <button type="button" className={styles.knowHow} onClick={markAsked}>
          I know how to play
        </button>
      </div>
    </div>
  )
}
