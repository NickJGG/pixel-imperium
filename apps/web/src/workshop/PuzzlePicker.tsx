import { type RefObject, useEffect, useRef, useState } from 'react'
import { usePadContain } from '../pad/PadProvider.tsx'
import { PuzzleFace } from './Shelf.tsx'
import { type PuzzleEntry, type PuzzleSort, findPuzzles, titleOf } from './workshop.ts'
import appStyles from '../App.module.css'
import styles from './Builder.module.css'
import own from './Workshop.module.css'

export type PickerFilter = 'free' | 'drafts' | 'published' | 'all'

const FILTERS: { value: PickerFilter; label: string }[] = [
  { value: 'free', label: 'Free' },
  { value: 'drafts', label: 'Drafts' },
  { value: 'published', label: 'Published' },
  { value: 'all', label: 'All' },
]

const SORTS: { value: PuzzleSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'size', label: 'Size' },
]

const entryId = (e: PuzzleEntry) => (e.kind === 'draft' ? e.id : e.puzzle.id)

/** Why a puzzle can't join: it's in this campaign already, or a published one is in another. */
export function usedBy(e: PuzzleEntry, inThis: ReadonlySet<string>): string | null {
  if (inThis.has(entryId(e))) return 'In this campaign'
  return e.kind === 'published' && e.puzzle.campaignId !== null ? 'In a campaign' : null
}

/**
 * Adds puzzles of Yours to a province: search, a filter (Free hides those already in a campaign) and a sort, a New
 * puzzle tile first. Each click numbers a pick; the footer adds them in that order, after the province's last.
 */
export function PuzzlePicker({
  entries,
  inThis,
  province,
  count,
  room,
  restore,
  onAdd,
  onNew,
  onClose,
}: {
  entries: readonly PuzzleEntry[]
  /** Every ref already in the campaign. */
  inThis: ReadonlySet<string>
  province: string
  /** Puzzles in the province now. */
  count: number
  /** How many more it takes. */
  room: number
  restore: RefObject<HTMLElement | null>
  onAdd: (refs: string[]) => void
  onNew: () => void
  onClose: () => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => dialogRef.current?.showModal(), [])
  usePadContain(dialogRef, true, onClose, restore)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<PickerFilter>('free')
  const [sort, setSort] = useState<PuzzleSort>('newest')
  const [picks, setPicks] = useState<string[]>([])

  const found = findPuzzles(entries, { query, filter: filter === 'free' ? 'all' : filter, sort }).filter(
    e => filter !== 'free' || usedBy(e, inThis) === null,
  )
  const toggle = (id: string) =>
    setPicks(p => (p.includes(id) ? p.filter(x => x !== id) : p.length < room ? [...p, id] : p))

  return (
    <dialog
      ref={dialogRef}
      className={`${appStyles.dialog} ${styles.picker}`}
      aria-labelledby="picker-title"
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
    >
      <h2 id="picker-title">Add puzzles to {province}</h2>
      <div className={own.controls}>
        <input
          type="search"
          className={own.search}
          placeholder={`Search ${entries.length} puzzles`}
          aria-label="Search by title"
          value={query}
          onChange={e => setQuery(e.currentTarget.value)}
        />
        <span className={own.seg} role="group" aria-label="Show">
          {FILTERS.map(f => (
            <button
              key={f.value}
              type="button"
              data-variant="flat"
              data-size="compact"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </span>
        <span className={own.seg} role="group" aria-label="Sort">
          {SORTS.map(s => (
            <button
              key={s.value}
              type="button"
              data-variant="flat"
              data-size="compact"
              aria-pressed={sort === s.value}
              onClick={() => setSort(s.value)}
            >
              {s.label}
            </button>
          ))}
        </span>
      </div>
      <ul className={`${own.grid} ${styles.pickerGrid}`}>
        <li>
          <button type="button" className={`${own.tile} ${styles.pick}`} onClick={onNew}>
            <span className={styles.newTile} aria-hidden="true">
              +
            </span>
            <span className={own.caption}>New puzzle</span>
          </button>
        </li>
        {found.map(e => {
          const id = entryId(e)
          const used = usedBy(e, inThis)
          const n = picks.indexOf(id) + 1
          const title = titleOf(e.kind === 'draft' ? e.title : e.puzzle.title)
          return (
            <li key={id}>
              <button
                type="button"
                className={`${own.tile} ${styles.pick}`}
                aria-pressed={n > 0}
                aria-label={`${title}${e.kind === 'draft' ? ', draft' : ''}${used ? `, ${used.toLowerCase()}` : ''}${n > 0 ? `, pick ${n}` : ''}`}
                disabled={used !== null || (n === 0 && picks.length >= room)}
                onClick={() => toggle(id)}
              >
                <PuzzleFace entry={e} />
                {n > 0 && (
                  <b className={styles.pickNumber} aria-hidden="true">
                    {n}
                  </b>
                )}
                <span className={own.caption}>{used ?? title}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {found.length === 0 && (
        <p className={own.empty}>{filter === 'free' && !query ? 'Every puzzle of yours is in a campaign.' : 'No puzzles match.'}</p>
      )}
      <div className={`${appStyles.dialogActions} ${styles.pickerFoot}`}>
        <p className={`${appStyles.leading} ${styles.pickerNote}`} role="status">
          {picks.length === 0
            ? room === 0
              ? `${province} is full.`
              : 'Click puzzles to pick them, in the order they’ll play.'
            : `Picked ${picks.length} · they’ll go in as numbered${count > 0 ? `, after puzzle ${count}` : ''}`}
        </p>
        {picks.length > 0 && (
          <button type="button" onClick={() => setPicks([])}>
            Clear
          </button>
        )}
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button type="button" data-variant="primary" disabled={picks.length === 0} onClick={() => onAdd(picks)}>
          Add {picks.length || ''} to {province}
        </button>
      </div>
    </dialog>
  )
}
