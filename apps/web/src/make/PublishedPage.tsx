/**
 * One of the Author's published puzzles in the editor's anatomy: the picture, fixed for good, and in the rail its
 * link to share, its title (the one thing that changes), Edit (a copy as a new draft) and Retire or Delete.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from '@tanstack/react-router'
import type { MadePuzzleSummary } from '@pixel-imperium/protocol'
import { cluesFromSolution } from '@pixel-imperium/nonogram'
import { getAccount } from '../account.ts'
import { deleteMadePuzzle, patchMadePuzzle, retireMadePuzzle } from '../api.ts'
import { paperFor } from '../album/paper.ts'
import { FloatingPills } from '../Hud.tsx'
import { RAIL_WIDTH } from '../play/layout.ts'
import { usePadContain } from '../pad/PadProvider.tsx'
import { type Draft, MAX_TITLE } from './draft.ts'
import { createDraft } from './draft-store.ts'
import { EditCanvas } from './EditCanvas.tsx'
import { Drawing, Stage } from './Stage.tsx'
import playStyles from '../play/Play.module.css'
import styles from './Make.module.css'

const NO_STUCK: readonly number[] = []

const pictureOf = (p: MadePuzzleSummary): Draft => ({
  id: p.id,
  title: p.title,
  width: p.width,
  height: p.height,
  cells: p.palette,
  colors: [...new Set(p.palette.filter(c => c !== null))],
})

export function PublishedPage({ puzzle }: { puzzle: MadePuzzleSummary }) {
  const navigate = useNavigate()
  const [title, setTitle] = useState(puzzle.title)
  const [retired, setRetired] = useState(puzzle.retired === true)
  const [notice, setNotice] = useState<string | null>(null)
  const picture = useMemo(() => pictureOf(puzzle), [puzzle])
  const clues = useMemo(
    () => cluesFromSolution(picture.width, picture.height, picture.cells.map(c => c !== null)),
    [picture],
  )
  const board = { width: picture.width, height: picture.height, clues }
  const url = `${location.origin}/play/${puzzle.id}`

  const editCopy = () => {
    const userId = getAccount().account?.userId
    if (!userId) return
    const id = createDraft(userId, { ...picture, title }, puzzle.paper)
    void navigate({ to: '/workshop/p/$id', params: { id } })
  }

  const copyLink = () =>
    navigator.clipboard.writeText(url).then(
      () => setNotice('Copied the link.'),
      () => setNotice('Couldn’t reach the clipboard.'),
    )

  const share = () => navigator.share({ title, url }).catch(() => {})

  const retire = async () => {
    try {
      await retireMadePuzzle(puzzle.id)
      setRetired(true)
      setNotice(null)
    } catch {
      setNotice('Couldn’t retire it. Try again in a moment.')
    }
  }

  const remove = async () => {
    try {
      if ((await deleteMadePuzzle(puzzle.id)) === 'retire') {
        setNotice('Other players have started it, so it can only be retired.')
        return
      }
      void navigate({ to: '/', replace: true })
    } catch {
      setNotice('Couldn’t delete it. Try again in a moment.')
    }
  }

  return (
    <main className={`${playStyles.shell} ${styles.make}`} data-rail style={paperFor(puzzle.paper ?? 'workshop')}>
      <FloatingPills />
      <div className={playStyles.shellBody}>
        <Stage puzzle={board}>
          {cellSize => (
            <Drawing puzzle={board} cellSize={cellSize}>
              <EditCanvas
                draft={picture}
                cellSize={cellSize}
                tool="pencil"
                color={null}
                mirror={false}
                stuck={NO_STUCK}
                onPick={() => {}}
                readOnly
              />
            </Drawing>
          )}
        </Stage>
        <div className={`${playStyles.rail} ${playStyles.underPills} ${styles.rail}`} style={{ width: RAIL_WIDTH }}>
          <div className={playStyles.railHead}>
            <p className={playStyles.railKicker}>
              {retired ? 'Retired' : 'Published'} · {picture.width}×{picture.height}
            </p>
            <PublishedTitle id={puzzle.id} title={title} onChange={setTitle} />
            {retired && (
              <p className={playStyles.railNote}>Closed to newcomers. Players who started it can still finish it.</p>
            )}
          </div>
          <div className={playStyles.railBody}>
            {!retired && (
              <section className={playStyles.railSection} aria-labelledby="published-link">
                <h2 id="published-link">Link</h2>
                <div className={styles.share}>
                  <input
                    className={styles.link}
                    readOnly
                    value={url}
                    aria-label="Link to the puzzle"
                    onFocus={e => e.currentTarget.select()}
                  />
                  <div className={playStyles.railFolds}>
                    <button type="button" data-size="compact" onClick={() => void copyLink()}>
                      Copy link
                    </button>
                    {'share' in navigator && (
                      <button type="button" data-size="compact" onClick={() => void share()}>
                        Share
                      </button>
                    )}
                  </div>
                </div>
              </section>
            )}
            <section className={playStyles.railSection} aria-labelledby="published-edit">
              <h2 id="published-edit">Picture</h2>
              <p className={`${playStyles.railNote} ${styles.tight}`}>
                It can’t change now. Edit opens a copy as a new draft, which publishes with its own link.
              </p>
            </section>
            <div className={playStyles.railFoot}>
              {notice && (
                <p className={styles.notice} role="status">
                  {notice}
                </p>
              )}
              <Link to="/play/$id" params={{ id: puzzle.id }} data-variant="primary" className={styles.playtest}>
                Play it
              </Link>
              <button type="button" data-variant="paper" onClick={editCopy}>
                Edit a copy
              </button>
              {puzzle.campaignId ? (
                <p className={styles.notice}>It’s in one of your campaigns, so it closes only with the campaign.</p>
              ) : (
                <>
                  {!retired && (
                    <ConfirmButton label="Retire" question="Close it to newcomers?" onConfirm={() => void retire()} />
                  )}
                  <ConfirmButton label="Delete" question="Delete it for good?" onConfirm={() => void remove()} />
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

/** The hero title; clicked, it opens a field, saved to the server on Done. */
function PublishedTitle({ id, title, onChange }: { id: string; title: string; onChange: (title: string) => void }) {
  const [edit, setEdit] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  if (edit === null) {
    return (
      <>
        <h1 className={playStyles.railName}>
          <button type="button" className={styles.title} title="Rename" onClick={() => setEdit(title)}>
            {title}
          </button>
        </h1>
        {failed && <p className={playStyles.railNote}>Couldn’t save the new title.</p>}
      </>
    )
  }
  const done = async () => {
    const next = edit.trim()
    setEdit(null)
    if (!next || next === title) return
    onChange(next)
    try {
      await patchMadePuzzle(id, { title: next })
      setFailed(false)
    } catch {
      onChange(title)
      setFailed(true)
    }
  }
  return (
    <form
      className={styles.titleForm}
      onSubmit={e => {
        e.preventDefault()
        void done()
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') setEdit(null)
      }}
    >
      <label>
        Title
        <input autoFocus maxLength={MAX_TITLE} value={edit} onChange={e => setEdit(e.target.value)} />
      </label>
      <button type="submit" data-size="compact">
        Done
      </button>
    </form>
  )
}

/** A button behind an inline confirm, as Clear's in Play; Escape cancels. */
function ConfirmButton({ label, question, onConfirm }: { label: string; question: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  usePadContain(boxRef, confirming, () => setConfirming(false), buttonRef)

  useEffect(() => {
    if (!confirming) return
    confirmRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      setConfirming(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [confirming])

  if (!confirming) {
    return (
      <button ref={buttonRef} type="button" data-size="compact" onClick={() => setConfirming(true)}>
        {label}
      </button>
    )
  }
  return (
    <div ref={boxRef} className={playStyles.confirm} role="group" aria-label={label}>
      <span>{question}</span>
      <button
        ref={confirmRef}
        type="button"
        data-variant="danger"
        onClick={() => {
          setConfirming(false)
          onConfirm()
        }}
      >
        {label}
      </button>
      <button type="button" data-variant="paper" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </div>
  )
}
