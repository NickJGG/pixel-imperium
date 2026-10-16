import { type CSSProperties, type ReactNode, type RefObject, useEffect, useRef, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import type { HexPaper } from '@pixel-imperium/protocol'
import { type Checks, MAX_COLORS, MAX_SIZE, MIN_SIZE, meetsRules } from '@pixel-imperium/nonogram'
import { publishPuzzle } from '../api.ts'
import { CheckIcon, CrossIcon } from '../album/icons.tsx'
import { derivePaper } from '../album/paper.ts'
import { forgetWorkshop } from '../content.ts'
import { usePadContain } from '../pad/PadProvider.tsx'
import { type Draft, MAX_TITLE } from './draft.ts'
import { commit, flushDraft, forgetDraft, getDraft, getDraftKey, getPaper, setPaper } from './draft-store.ts'
import appStyles from '../App.module.css'
import pillStyles from '../album/CountPill.module.css'
import styles from './Make.module.css'

/** The pick a fresh paper starts from: the workshop's own tan. */
export const FIRST_PICK = '#c8a46e'

/** Each theme's ink, as a swatch of the other theme has to show it whichever is on. */
const NIGHT_INK = '#e6edff'
const DAY_INK = '#13306b'

const REFUSED: Record<number, string> = {
  403: 'This account can no longer publish.',
  429: 'That’s 20 puzzles published today. Try again tomorrow.',
  422: 'The server found it breaks a rule. Check the drawing and try again.',
}

export function PublishButton({ draft, checks }: { draft: Draft; checks: Checks | null }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-variant="paper"
        className={styles.playtest}
        disabled={draft.cells.every(c => c === null)}
        onClick={() => setOpen(true)}
      >
        Publish…
      </button>
      {open && <PublishSheet draft={draft} checks={checks} restore={triggerRef} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Title, an optional paper with its Night and Day, the publish rules, and the one-way warning. */
function PublishSheet({
  draft,
  checks,
  restore,
  onClose,
}: {
  draft: Draft
  checks: Checks | null
  restore: RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [title, setTitle] = useState(draft.title)
  const [paper, setPaperPick] = useState<HexPaper | null>(getPaper)
  const [state, setState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null })

  useEffect(() => dialogRef.current?.showModal(), [])
  usePadContain(dialogRef, true, onClose, restore)

  const colors = new Set(draft.cells.filter(c => c !== null)).size
  const sized = (n: number) => n >= MIN_SIZE && n <= MAX_SIZE
  const ok = checks !== null && meetsRules(checks, colors)

  const publish = async () => {
    const key = getDraftKey()
    if (!key) return
    setState({ sending: true, error: null })
    const name = title.trim() || draft.title
    if (name !== getDraft().title) commit({ ...getDraft(), title: name })
    setPaper(paper)
    if (!(await flushDraft())) {
      setState({ sending: false, error: 'Couldn’t reach the server. Your draft is safe on this device.' })
      return
    }
    const res = await publishPuzzle(key.id, { title: name, paper }).catch(() => null)
    if (!res || !('id' in res)) {
      setState({ sending: false, error: (res && REFUSED[res.status]) ?? 'Couldn’t publish it. Try again in a moment.' })
      return
    }
    forgetDraft(key)
    forgetWorkshop()
    void navigate({ to: '/workshop/p/$id', params: { id: res.id }, replace: true })
  }

  return (
    <dialog
      ref={dialogRef}
      className={appStyles.dialog}
      aria-labelledby="publish-title"
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
    >
      <form
        className={styles.publish}
        onSubmit={e => {
          e.preventDefault()
          void publish()
        }}
      >
        <h2 id="publish-title">Publish this puzzle</h2>
        <fieldset disabled={state.sending}>
          <label className={styles.field}>
            Title
            <input value={title} maxLength={MAX_TITLE} required onChange={e => setTitle(e.target.value)} />
          </label>
          <PaperField paper={paper} onChange={setPaperPick} />
        </fieldset>
        <ul className={styles.rules} aria-label="Publish rules">
          <Rule ok={checks?.unique}>One solution</Rule>
          <Rule ok={checks && checks.passes !== null}>Solvable by line logic, no guessing</Rule>
          <Rule ok={sized(draft.width) && sized(draft.height)}>
            {MIN_SIZE}–{MAX_SIZE} cells a side
          </Rule>
          <Rule ok={colors >= 1 && colors <= MAX_COLORS}>1–{MAX_COLORS} colors</Rule>
        </ul>
        <p>The picture can’t change after publishing. Anyone with the link can play it.</p>
        {state.error && <p role="alert">{state.error}</p>}
        <div className={appStyles.dialogActions}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" data-variant="primary" disabled={!ok || state.sending}>
            {state.sending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </form>
    </dialog>
  )
}

/** `ok` undefined or null: the checks are still running. */
export function Rule({ ok, children }: { ok: boolean | null | undefined; children: ReactNode }) {
  return (
    <li data-ok={ok ?? undefined}>
      {ok == null ? <span aria-hidden="true">…</span> : ok ? <CheckIcon /> : <CrossIcon />}
      {children}
      {ok == null && <span className={styles.ruleNote}>checking</span>}
    </li>
  )
}

/** A pill, green with a check or red with a cross; `ok` null, neither yet. */
export function Badge({ ok, children }: { ok: boolean | null; children: ReactNode }) {
  return (
    <span className={`${pillStyles.pill} ${styles.badge}`} data-ok={ok ?? undefined}>
      {ok !== null && (ok ? <CheckIcon /> : <CrossIcon />)}
      {children}
    </span>
  )
}

/**
 * The workshop's paper, or a pick of the player's, shown as it'll be in Night and in Day. `none` names what no pick
 * means, or is `false` where a pick is required.
 */
export function PaperField({
  paper,
  onChange,
  none = { label: 'Workshop', note: 'The Workshop’s own paper, in both themes.' },
}: {
  paper: HexPaper | null
  onChange: (paper: HexPaper | null) => void
  none?: { label: string; note: string } | false
}) {
  const derived = paper && derivePaper(paper)
  return (
    <div className={styles.field} role="group" aria-labelledby="paper-label">
      <span id="paper-label">Paper</span>
      <div className={styles.paperRow}>
        {none && (
          <button type="button" data-size="compact" aria-pressed={paper === null} onClick={() => onChange(null)}>
            {none.label}
          </button>
        )}
        <label className={styles.paperPick} data-picked={paper !== null || undefined} style={{ '--c': paper ?? FIRST_PICK } as CSSProperties}>
          <input
            type="color"
            aria-label="Pick a paper color"
            value={paper ?? FIRST_PICK}
            onChange={e => onChange(e.target.value.toLowerCase() as HexPaper)}
          />
          Pick…
        </label>
      </div>
      {derived ? (
        <div className={styles.swatches}>
          <Swatch name="Night" page={derived.night} tab={derived.tab} ink={NIGHT_INK} />
          <Swatch name="Day" page={derived.day} tab={derived.tab} ink={DAY_INK} />
        </div>
      ) : (
        none && <p className={styles.ruleNote}>{none.note}</p>
      )}
    </div>
  )
}

function Swatch({ name, page, tab, ink }: { name: string; page: string; tab: string; ink: string }) {
  return (
    <span className={styles.swatch} style={{ '--page': page, '--tab-c': tab, color: ink } as CSSProperties}>
      {name}
    </span>
  )
}
