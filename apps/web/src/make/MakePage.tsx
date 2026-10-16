/**
 * The puzzle editor: a Workshop draft at /workshop/p/<draft>, and in dev /make, for drawing a puzzle and taking its
 * JSON to a campaign's data file. Play's anatomy on the workshop's paper: the colors down the strip, the drawing
 * with its live clues, and the tools in the rail. draft-store.ts keeps the draft and says when it reaches the server.
 */
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import {
  type Checks,
  MAX_COLORS,
  cluesFromSolution,
  formatSeed,
  fromSeed,
  paletteLetters,
  parsePaste,
  toSeed,
} from '@pixel-imperium/nonogram'
import { type Paper, paperFor } from '../album/paper.ts'
import { CrownMark, FloatingPills } from '../Hud.tsx'
import { usePadPage } from '../pad/PadProvider.tsx'
import { useCentredFilm } from '../play/Filmstrip.tsx'
import { RAIL_WIDTH } from '../play/layout.ts'
import { RailTools } from '../play/RailTools.tsx'
import type { PlayStore } from '../play/store.ts'
import { type Draft, MAX_TITLE, flipH, flipV, moveColor, nudge, resize, slugify, stepSize } from './draft.ts'
import {
  type DraftKey,
  type SaveState,
  type StoredDraft,
  blankStored,
  commit,
  flushDraft,
  getDraft,
  localDraft,
  openDraft,
  redo,
  strokeStart,
  undo,
  useDraft,
  useHistory,
  useSaveState,
} from './draft-store.ts'
import { ColorSheet } from './ColorSheet.tsx'
import { EditCanvas, type Tool } from './EditCanvas.tsx'
import { PlaytestBoard, playtestStore, useStoreValue } from './Playtest.tsx'
import { Badge, PublishButton } from './PublishSheet.tsx'
import { Drawing, Stage } from './Stage.tsx'
import { useChecks } from './useChecks.ts'
import { useChipDrag } from './useChipDrag.ts'
import pillStyles from '../album/CountPill.module.css'
import playStyles from '../play/Play.module.css'
import styles from './Make.module.css'

const NO_STUCK: readonly number[] = []

const TOOLS: { tool: Tool; name: string; key: string; icon: ReactNode }[] = [
  {
    tool: 'pencil',
    name: 'Pencil',
    key: 'P',
    icon: (
      <>
        <path d="M4 20l1-5L16 4l4 4L9 19z" />
        <path d="M14 6l4 4" />
      </>
    ),
  },
  {
    tool: 'fill',
    name: 'Fill',
    key: 'F',
    icon: (
      <>
        <path d="M11 3 4 10l7 7 7-7z" />
        <path d="M4 10h14" />
        <path d="M20 15s1.5 2 1.5 3a1.5 1.5 0 0 1-3 0c0-1 1.5-3 1.5-3z" />
      </>
    ),
  },
  {
    tool: 'pick',
    name: 'Pick a color',
    key: 'I',
    icon: (
      <>
        <path d="M14 4l6 6" />
        <path d="M17 7l-9 9-4 4-1-1 4-4 9-9" />
        <path d="M12 6l6 6" />
      </>
    ),
  },
  { tool: 'line', name: 'Line', key: 'L', icon: <path d="M5 19 19 5" /> },
  { tool: 'rect', name: 'Rectangle', key: 'R', icon: <rect x="4" y="6" width="16" height="12" rx="1" /> },
]

const TOOL_KEYS = new Map(TOOLS.map(t => [t.key.toLowerCase(), t.tool]))

const NUDGES: Record<string, [number, number]> = {
  arrowup: [0, -1],
  arrowdown: [0, 1],
  arrowleft: [-1, 0],
  arrowright: [1, 0],
}

const LEGEND = [
  ['Paint', 'Left drag'],
  ['Paint empty', 'Right drag'],
  ['Pick a color', 'Alt-click'],
  ['Nudge picture', 'Shift + arrows'],
  ['Move color', 'Alt + ↑/↓'],
] as const

const DEV_KEY: DraftKey = { userId: null, id: 'make' }

/** Dev only: /make, the draft on this device, for a campaign's data file. */
export function DevMakePage() {
  useState(() => openDraft(DEV_KEY, localDraft(DEV_KEY) ?? blankStored()))
  return <MakePage workshop={false} />
}

/**
 * A Workshop draft, opened from whichever copy is newer, this device's or the server's; key it by draft id. Opened
 * from a draft campaign's province, it wears that province's paper and `parent` is the way back up.
 */
export function WorkshopDraftPage({
  draftKey,
  stored,
  paper,
  parent,
}: {
  draftKey: DraftKey
  stored: StoredDraft
  paper: Paper
  parent: string | undefined
}) {
  useState(() => openDraft(draftKey, stored))
  useEffect(() => {
    const leave = () => void flushDraft({ keepalive: true })
    const onVisibility = () => document.visibilityState === 'hidden' && leave()
    window.addEventListener('pagehide', leave)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', leave)
      document.removeEventListener('visibilitychange', onVisibility)
      leave()
    }
  }, [])
  return <MakePage workshop paper={paper} parent={parent} />
}

const SAVE_NOTE: Record<SaveState, string> = { saved: 'Saved', saving: 'Saving…', local: 'Saved on this device' }

function MakePage({ workshop, paper = 'workshop', parent }: { workshop: boolean; paper?: Paper; parent?: string | undefined }) {
  usePadPage({ parent })
  const draft = useDraft()
  const saveState = useSaveState()
  const { canUndo, canRedo } = useHistory()
  const [tool, setTool] = useState<Tool>('pencil')
  const [mirror, setMirror] = useState(false)
  const [chosen, setChosen] = useState<string | null>(() => getDraft().colors[0] ?? null)
  const [notice, setNotice] = useState<string | null>(null)
  const [test, setTest] = useState<PlayStore | null>(null)
  const color = chosen === null || draft.colors.includes(chosen) ? chosen : (draft.colors[0] ?? null)

  const clues = useMemo(
    () => cluesFromSolution(draft.width, draft.height, draft.cells.map(c => c !== null)),
    [draft.width, draft.height, draft.cells],
  )
  const puzzle = { width: draft.width, height: draft.height, clues }
  const latest = useChecks(draft)
  const checks = latest?.width === draft.width && latest.height === draft.height ? latest : null

  useEffect(() => {
    if (test) return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable]')) return
      if (strokeStart()) return
      const key = e.key.toLowerCase()
      const d = getDraft()
      if (e.ctrlKey || e.metaKey) {
        if (key === 'z' && !e.shiftKey) undo()
        else if (key === 'y' || key === 'z') redo()
        else return
      } else if (e.altKey) {
        const from = color === null ? -1 : d.colors.indexOf(color)
        if (from === -1 || (key !== 'arrowup' && key !== 'arrowdown')) return
        commit(moveColor(d, from, from + (key === 'arrowup' ? -1 : 1)))
      } else if (e.shiftKey && NUDGES[key]) {
        commit(nudge(d, ...NUDGES[key]))
      } else if (TOOL_KEYS.has(key)) {
        setTool(TOOL_KEYS.get(key)!)
      } else if (key === 'm') {
        setMirror(m => !m)
      } else if (key === 'h') {
        commit(flipH(d))
      } else if (key === 'v') {
        commit(flipV(d))
      } else if (/^[0-9]$/.test(key)) {
        const n = Number(key)
        if (n > d.colors.length) return
        setChosen(n === 0 ? null : d.colors[n - 1]!)
      } else {
        return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [color, test])

  const paste = async () => {
    let text: string | null
    try {
      text = await navigator.clipboard.readText()
    } catch {
      text = prompt('Paste a puzzle’s JSON')
    }
    if (!text) return
    try {
      const seed = parsePaste(text)
      if (!confirm(`Replace “${getDraft().title}” with “${seed.title}”?`)) return
      const next = fromSeed(seed)
      commit(next)
      setChosen(next.colors[0] ?? null)
      setNotice(`Pasted “${seed.title}”.`)
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err))
    }
  }

  const copy = () =>
    navigator.clipboard.writeText(formatSeed(toSeed(getDraft()))).then(
      () => setNotice('Copied the JSON.'),
      () => setNotice('Couldn’t reach the clipboard.'),
    )

  return (
    <main className={`${playStyles.shell} ${styles.make}`} data-rail style={paperFor(paper)}>
      <FloatingPills />
      <div className={playStyles.shellBody}>
        {!test && <ColorStrip draft={draft} chosen={color} onChoose={setChosen} />}
        <Stage puzzle={puzzle}>
          {cellSize =>
            test ? (
              <PlaytestBoard store={test} draft={draft} cellSize={cellSize} />
            ) : (
              <Drawing puzzle={puzzle} cellSize={cellSize}>
                <EditCanvas
                  draft={draft}
                  cellSize={cellSize}
                  tool={tool}
                  color={color}
                  mirror={mirror}
                  stuck={checks?.stuck ?? NO_STUCK}
                  onPick={setChosen}
                />
              </Drawing>
            )
          }
        </Stage>
        <div className={`${playStyles.rail} ${playStyles.underPills} ${styles.rail}`} style={{ width: RAIL_WIDTH }}>
          <div className={playStyles.railHead}>
            <p className={playStyles.railKicker} role="status">
              {workshop ? `Draft · ${SAVE_NOTE[saveState]}` : 'Make · draft on this device'}
            </p>
            <Title draft={draft} withId={!workshop} />
            {!test && <CheckBadges draft={draft} checks={checks} />}
          </div>
          <div className={playStyles.railBody}>
            {test ? (
              <>
                <section className={playStyles.railSection} aria-labelledby="make-playtest">
                  <h2 id="make-playtest">Playtest</h2>
                  <p className={`${playStyles.railNote} ${styles.tight}`}>The real board and tools. Solve it to see the reveal.</p>
                </section>
                <RailTools store={test} />
                <PlaytestFoot store={test} draft={draft} onBack={() => setTest(null)} />
              </>
            ) : (
              <>
                <div className={`${playStyles.railTools} ${styles.roomy}`} role="toolbar" aria-label="Tools">
                  <div className={`${playStyles.joined} ${styles.tools}`} role="group" aria-label="Tool">
                    {TOOLS.map(t => (
                      <button
                        key={t.tool}
                        type="button"
                        data-variant="flat"
                        data-size="compact"
                        aria-label={t.name}
                        title={t.name}
                        aria-pressed={tool === t.tool}
                        onClick={() => setTool(t.tool)}
                      >
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          {t.icon}
                        </svg>
                        <Keycap>{t.key}</Keycap>
                      </button>
                    ))}
                  </div>
                  <div className={playStyles.railToolRow}>
                    <button
                      type="button"
                      className={playStyles.railLines}
                      aria-pressed={mirror}
                      title="Every stroke mirrors across the middle"
                      onClick={() => setMirror(!mirror)}
                    >
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 3v18" />
                        <path d="M8 7 4 12l4 5z" />
                        <path d="M16 7l4 5-4 5" />
                      </svg>
                      Mirror
                      <Keycap>M</Keycap>
                    </button>
                    <button type="button" aria-label="Undo" title="Undo" disabled={!canUndo} onClick={undo}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M9 14 4 9l5-5" />
                        <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
                      </svg>
                      <Keycap>Ctrl Z</Keycap>
                    </button>
                    <button type="button" aria-label="Redo" title="Redo" disabled={!canRedo} onClick={redo}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="m15 14 5-5-5-5" />
                        <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
                      </svg>
                      <Keycap>Ctrl Y</Keycap>
                    </button>
                  </div>
                </div>
                <section className={playStyles.railSection} aria-labelledby="make-picture">
                  <h2 id="make-picture">Picture</h2>
                  <div className={styles.sizeRow}>
                    <Stepper label="W" value={draft.width} onStep={dir => commit(resize(draft, stepSize(draft.width, dir), draft.height))} />
                    <Stepper label="H" value={draft.height} onStep={dir => commit(resize(draft, draft.width, stepSize(draft.height, dir)))} />
                  </div>
                  <div className={playStyles.railFolds}>
                    <button type="button" data-size="compact" className={styles.flip} title="Flip left–right" onClick={() => commit(flipH(draft))}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M4 12h16" />
                        <path d="M8 8l-4 4 4 4" />
                        <path d="M16 8l4 4-4 4" />
                      </svg>
                      Flip
                      <Keycap>H</Keycap>
                    </button>
                    <button type="button" data-size="compact" className={styles.flip} title="Flip top–bottom" onClick={() => commit(flipV(draft))}>
                      <svg viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M12 4v16" />
                        <path d="M8 8l4-4 4 4" />
                        <path d="M8 16l4 4 4-4" />
                      </svg>
                      Flip
                      <Keycap>V</Keycap>
                    </button>
                  </div>
                </section>
                <section className={playStyles.railSection} aria-labelledby="make-controls">
                  <h2 id="make-controls">Controls</h2>
                  <dl className={playStyles.legend}>
                    {LEGEND.map(([action, input]) => (
                      <div key={action}>
                        <dt>{action}</dt>
                        <dd>{input}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
                <div className={playStyles.railFoot}>
                  {notice && (
                    <p className={styles.notice} role="status">
                      {notice}
                    </p>
                  )}
                  <button
                    type="button"
                    data-variant="primary"
                    className={styles.playtest}
                    disabled={draft.cells.every(c => c === null)}
                    onClick={() => {
                      void flushDraft()
                      setTest(playtestStore(getDraft()))
                    }}
                  >
                    Playtest
                  </button>
                  {workshop && <PublishButton draft={draft} checks={checks} />}
                  {import.meta.env.DEV && (
                    <div className={playStyles.railFolds}>
                      <button type="button" data-size="compact" onClick={() => void paste()}>
                        Paste JSON
                      </button>
                      <button type="button" data-size="compact" onClick={() => void copy()}>
                        Copy JSON
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

/**
 * Empty first, then the colors in order, each under its number key; captions preview the exported letter. "+"
 * opens the color sheet for a new color, and the chosen chip (clicked again, or any chip double-clicked) for
 * its own. Colors drag to reorder; empty stays put.
 */
function ColorStrip({ draft, chosen, onChoose }: { draft: Draft; chosen: string | null; onChoose: (c: string | null) => void }) {
  const { listRef, currentRef } = useCentredFilm()
  const stripRef = useRef<HTMLElement>(null)
  const [sheet, setSheet] = useState<{ target: string | null; anchor: HTMLElement } | null>(null)
  const { drag, order, floaterRef, onPointerDown, consumeDrag } = useChipDrag(draft.colors, stripRef, listRef, (from, to) =>
    commit(moveColor(getDraft(), from, to)),
  )
  useEffect(() => {
    if (drag) setSheet(null)
  }, [drag])
  const letters = paletteLetters(order)
  const editing = sheet !== null && sheet.target !== null
  const adding = sheet !== null && sheet.target === null

  return (
    <nav ref={stripRef} className={`${playStyles.film} ${styles.strip}`} aria-label="Colors">
      <Link to="/" className={playStyles.filmMark} aria-label="Pixel Imperium">
        <CrownMark />
      </Link>
      <p className={playStyles.filmHead}>
        Colors
        <span>
          {draft.colors.length} of {MAX_COLORS}
        </span>
      </p>
      <ol ref={listRef} className={`${playStyles.filmSlots} ${styles.chips}`}>
        {[null, ...order].map((c, i) => {
          const current = c === chosen
          return (
            <li
              key={c ?? ''}
              ref={current ? currentRef : undefined}
              className={current ? playStyles.filmCurrent : undefined}
              data-color={c ?? undefined}
              data-ghost={(c !== null && c === drag?.color) || undefined}
              data-sheet-anchor={(current && editing) || undefined}
            >
              <button
                type="button"
                className={styles.chip}
                data-empty={c === null || undefined}
                style={c === null ? undefined : ({ '--c': c } as CSSProperties)}
                aria-label={c === null ? 'Empty' : `Color ${i}, ${c}`}
                aria-pressed={current}
                onPointerDown={c === null ? undefined : e => onPointerDown(e, c)}
                onClick={e => {
                  if (consumeDrag()) return
                  if (c === null || !current) return onChoose(c)
                  setSheet(editing ? null : { target: c, anchor: e.currentTarget.parentElement! })
                }}
                onDoubleClick={e => {
                  if (c !== null && !editing) setSheet({ target: c, anchor: e.currentTarget.parentElement! })
                }}
              >
                <Keycap>{String(i)}</Keycap>
              </button>
              <span className={playStyles.filmCaption}>{c === null ? 'empty' : letters[i - 1]}</span>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        className={styles.add}
        aria-label="Add a color"
        aria-expanded={adding}
        data-sheet-anchor={adding || undefined}
        disabled={draft.colors.length >= MAX_COLORS}
        onClick={e => setSheet(adding ? null : { target: null, anchor: e.currentTarget })}
      >
        +
      </button>
      {sheet && (
        <ColorSheet
          key={sheet.target ?? ''}
          target={sheet.target}
          anchor={sheet.anchor}
          onChoose={onChoose}
          onClose={() => setSheet(null)}
        />
      )}
      {drag && (
        <div
          ref={floaterRef}
          className={styles.floater}
          style={{ top: drag.top, left: drag.left, '--c': drag.color } as CSSProperties}
          aria-hidden="true"
        />
      )}
    </nav>
  )
}

/** Size, the two puzzle rules and the rating, under the title; the note says what the hatched cells mean. */
function CheckBadges({ draft, checks }: { draft: Draft; checks: Checks | null }) {
  const stuck = checks?.stuck.length ?? 0
  return (
    <>
      <div className={playStyles.railBadges}>
        <span className={`${pillStyles.pill} ${styles.badge}`}>
          {draft.width}×{draft.height}
        </span>
        {checks && (
          <>
            <Badge ok={checks.unique}>{checks.unique ? 'Unique' : '2 solutions'}</Badge>
            <Badge ok={checks.passes !== null}>{checks.passes !== null ? `Logic · ${checks.passes}` : 'Stalls'}</Badge>
            {checks.rating !== null && <span className={`${pillStyles.pill} ${styles.badge}`}>Rating {checks.rating}/5</span>}
          </>
        )}
      </div>
      {checks && stuck > 0 && (
        <p className={playStyles.railNote}>
          {checks.unique
            ? `Line logic stalls on the ${stuck} hatched cells.`
            : `The ${stuck} hatched cells can swap: a second picture fits these clues.`}
        </p>
      )}
    </>
  )
}

function PlaytestFoot({ store, draft, onBack }: { store: PlayStore; draft: Draft; onBack: () => void }) {
  const revealed = useStoreValue(store, s => s.palette !== null)
  return (
    <div className={playStyles.railFoot}>
      <button
        type="button"
        data-variant="primary"
        className={styles.playtest}
        disabled={revealed}
        onClick={() => store.setPalette(draft.cells)}
      >
        Skip to reveal
      </button>
      <button type="button" onClick={onBack}>
        Back to Draw
      </button>
    </div>
  )
}

/**
 * The hero title; clicked, it opens a field for it and, `withId`, for the id a data file gives it, which follows
 * the title until edited.
 */
function Title({ draft, withId }: { draft: Draft; withId: boolean }) {
  const [edit, setEdit] = useState<{ title: string; id: string } | null>(null)
  if (!edit) {
    return (
      <h1 className={playStyles.railName}>
        <button type="button" className={styles.title} title="Rename" onClick={() => setEdit({ title: draft.title, id: draft.id })}>
          {draft.title}
        </button>
      </h1>
    )
  }
  const done = () => {
    const title = edit.title.trim() || draft.title
    const id = slugify(edit.id)
    if (title !== draft.title || id !== draft.id) commit({ ...getDraft(), title, id })
    setEdit(null)
  }
  return (
    <form
      className={styles.titleForm}
      onSubmit={e => {
        e.preventDefault()
        done()
      }}
      onKeyDown={e => {
        if (e.key === 'Escape') setEdit(null)
      }}
    >
      <label>
        Title
        <input
          autoFocus
          maxLength={MAX_TITLE}
          value={edit.title}
          onChange={e => {
            const title = e.target.value
            setEdit({ title, id: edit.id === slugify(edit.title) ? slugify(title) : edit.id })
          }}
        />
      </label>
      {withId && (
        <label>
          Id
          <input value={edit.id} spellCheck={false} onChange={e => setEdit({ ...edit, id: e.target.value })} />
        </label>
      )}
      <button type="submit" data-size="compact">
        Done
      </button>
    </form>
  )
}

function Stepper({ label, value, onStep }: { label: string; value: number; onStep: (dir: 1 | -1) => void }) {
  return (
    <span className={styles.stepper}>
      <span>{label}</span>
      <button type="button" data-size="compact" aria-label={`${label} smaller`} onClick={() => onStep(-1)}>
        −
      </button>
      <b>{value}</b>
      <button type="button" data-size="compact" aria-label={`${label} larger`} onClick={() => onStep(1)}>
        +
      </button>
    </span>
  )
}

/** A shortcut's badge in a button's corner, shown while the button is hovered or focused. */
function Keycap({ children }: { children: string }) {
  return (
    <kbd className={`${playStyles.keycap} ${styles.keycap}`} aria-hidden="true">
      {children}
    </kbd>
  )
}
