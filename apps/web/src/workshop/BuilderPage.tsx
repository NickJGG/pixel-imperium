/**
 * A draft campaign's provinces, edited in place: the open province's page as the album draws it (head, shelves,
 * flavour), the others as spines, and a dashed spine for another. Tiers come from the server's last check of the
 * draft and are only a preview until it's published. Puzzles drag within the shelves, or onto a spine to move there.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { type CSSProperties, Fragment, type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { DraftCampaignDoc, Province } from '@pixel-imperium/protocol'
import { CountPill } from '../album/CountPill.tsx'
import { TrashIcon } from '../album/icons.tsx'
import { Slot } from '../album/Slot.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { useAccount } from '../account.ts'
import { TIER_NAME } from '../campaign/ProvincePage.tsx'
import { shelfLayout, tierGroups } from '../campaign/progress.ts'
import {
  AddProvinceSpine,
  Backdrop,
  DraftProvinceSpine,
  World,
  Worlds,
  draftProvinceMorph,
  usePhone,
  useSpineReach,
  useStep,
} from '../campaign/worlds/Worlds.tsx'
import { MAX_TITLE } from '../make/draft.ts'
import { localDrafts, newDraftId } from '../make/draft-store.ts'
import { useHudTrail } from '../Trail.tsx'
import { draftProvinceTrail } from '../trails.ts'
import {
  MAX_PROVINCES,
  MAX_PROVINCE_PUZZLES,
  type PuzzleInfo,
  TIERED_FROM,
  addProvince,
  appendPuzzles,
  draftAsCampaign,
  formatIn,
  movePuzzle,
  problemOf,
  provinceName,
  puzzleInfos,
  removeProvince,
  removePuzzle,
  setProvince,
  tiersOf,
} from './campaign-draft.ts'
import { type CampaignKey, type StoredCampaign, editCampaign, flushOnLeave, openCampaign, useCampaign } from './campaign-store.ts'
import { EditableText, PaperChip } from './fields.tsx'
import { PuzzlePicker } from './PuzzlePicker.tsx'
import { type Drop, useSlotDrag } from './useSlotDrag.ts'
import { type Workshop, mergeDrafts, titleOf, yourPuzzles } from './workshop.ts'
import provinceStyles from '../campaign/Province.module.css'
import campaignStyles from '../campaign/Campaign.module.css'
import styles from './Builder.module.css'

const MAX_FLAVOUR = 200

export function BuilderPage({
  draftKey,
  opening,
  workshop,
  n,
}: {
  draftKey: CampaignKey
  opening: StoredCampaign
  workshop: Workshop
  /** The province open, 1-based. */
  n: number
}) {
  useState(() => openCampaign(draftKey, opening))
  useEffect(flushOnLeave, [])
  const { doc, preview } = useCampaign() ?? opening
  const navigate = useNavigate()
  const phone = usePhone()
  const [local] = useState(() => localDrafts(draftKey.userId))
  const entries = useMemo(() => yourPuzzles(mergeDrafts(workshop.drafts.puzzles, local), workshop.made), [workshop, local])
  const infos = useMemo(() => puzzleInfos(entries, local), [entries, local])
  const campaign = draftAsCampaign(draftKey.id, doc, preview, infos)
  const k = Math.min(Math.max(0, n - 1), doc.provinces.length - 1)
  // A draft with no provinces yet opens on its first.
  const shown = campaign.provinces[k] ?? { name: provinceName(doc, 0), paper: doc.paper ?? 'workshop' }
  useHudTrail(draftProvinceTrail(draftKey.id, doc, Math.max(1, k + 1), shown))

  const goTo = (to: number) => {
    if (to < 0 || to >= doc.provinces.length || to === k) return
    void navigate({ to: '/workshop/c/$id/$n', params: { id: draftKey.id, n: String(to + 1) }, replace: true })
  }
  useStep(dir => goTo(k + dir))
  const ref = useRef<HTMLElement>(null)
  useSpineReach(ref)

  const add = () => editCampaign(addProvince)
  const page = (p: Province, j: number) => (
    <BuilderColumn
      key={p.id}
      draftId={draftKey.id}
      doc={doc}
      province={p}
      k={j}
      tiers={tiersOf(doc, preview, j) !== null}
      problem={i => problemOf(doc, preview, { k: j, i })}
      infos={infos}
      entries={entries}
      start={j === k}
      onAddProvince={phone && doc.provinces.length < MAX_PROVINCES ? add : undefined}
    />
  )

  if (doc.provinces.length === 0) {
    return (
      <main ref={ref} className={provinceStyles.page}>
        <Worlds>
          <World paper={doc.paper ?? 'workshop'} labelledBy="no-provinces" start pair>
            <div className={`${provinceStyles.zoom} ${provinceStyles.locked}`}>
              <div className={provinceStyles.lockedMsg}>
                <p className={provinceStyles.kicker}>{titleOf(doc.title)} · draft</p>
                <h1 id="no-provinces" className={provinceStyles.name}>
                  No provinces yet
                </h1>
                <p>A campaign has one to six provinces, each unlocking once the one before it is conquered.</p>
                <Link
                  to="/workshop/c/$id/$n"
                  params={{ id: draftKey.id, n: '1' }}
                  replace
                  data-variant="primary"
                  data-pad-default
                  onClick={add}
                >
                  + Province
                </Link>
              </div>
            </div>
          </World>
        </Worlds>
      </main>
    )
  }

  if (phone) {
    return (
      <main ref={ref} className={provinceStyles.page}>
        <Worlds carousel onSnap={goTo}>
          {campaign.provinces.map(page)}
        </Worlds>
      </main>
    )
  }
  return (
    <main ref={ref} className={provinceStyles.page}>
      <Backdrop paper={campaign.provinces[k]!.paper} />
      <Worlds>
        {campaign.provinces.map((p, j) =>
          j === k ? (
            <Fragment key={p.id}>{page(p, j)}</Fragment>
          ) : (
            <DraftProvinceSpine
              key={p.id}
              draftId={draftKey.id}
              n={j + 1}
              name={p.name}
              paper={p.paper}
              count={p.puzzles.length > 0 ? String(p.puzzles.length) : null}
            />
          ),
        )}
        {doc.provinces.length < MAX_PROVINCES && (
          <AddProvinceSpine draftId={draftKey.id} n={doc.provinces.length + 1} onAdd={add} />
        )}
      </Worlds>
    </main>
  )
}

const PROBLEM: Record<'missing' | 'taken' | 'fails', string> = {
  missing: 'Not saved yet',
  taken: 'In another campaign',
  fails: 'Breaks a rule',
}

function BuilderColumn({
  draftId,
  doc,
  province,
  k,
  tiers,
  problem,
  infos,
  entries,
  start,
  onAddProvince,
}: {
  draftId: string
  doc: DraftCampaignDoc
  province: Province
  k: number
  /** The server's preview has cuts for it. */
  tiers: boolean
  problem: (i: number) => 'missing' | 'taken' | 'fails' | undefined
  infos: ReadonlyMap<string, PuzzleInfo>
  entries: Parameters<typeof PuzzlePicker>[0]['entries']
  start: boolean
  /** On a phone, where there's no dashed spine. */
  onAddProvince: (() => void) | undefined
}) {
  const navigate = useNavigate()
  const draft = doc.provinces[k]!
  const count = draft.puzzleIds.length
  const room = MAX_PROVINCE_PUZZLES - count
  const [picking, setPicking] = useState(false)
  const addRef = useRef<HTMLButtonElement>(null)
  const { drag, onPointerDown, consumeDrag } = useSlotDrag(k, (from, drop: Drop) =>
    editCampaign(d => movePuzzle(d, { k, i: from }, 'k' in drop ? { k: drop.k, i: Infinity } : { k, i: drop.i }), { soon: true }),
  )
  const name = provinceName(doc, k)
  const id = `draft-province-${k + 1}`
  const within = formatIn({ id: draftId, n: k + 1 })

  const groups = tiers ? tierGroups(province) : [{ tier: null, slots: province.puzzles.map((puzzle, i) => ({ puzzle, number: i + 1 })) }]
  const plusSlot = !tiers && count < TIERED_FROM && room > 0
  const sizes = groups.map((g, gi) => g.slots.length + (plusSlot && gi === groups.length - 1 ? 1 : 0))
  const { rows, columns } = shelfLayout(sizes)

  const move = (i: number, dir: -1 | 1) => {
    if (i + dir < 0 || i + dir >= count) return
    editCampaign(d => movePuzzle(d, { k, i }, { k, i: i + dir }), { soon: true })
  }
  const onSlotKey = (e: KeyboardEvent, i: number) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    move(i, e.key === 'ArrowLeft' ? -1 : 1)
  }

  const newPuzzle = () => {
    const ref = newDraftId()
    editCampaign(d => appendPuzzles(d, k, [ref]), { soon: true })
    void navigate({ to: '/workshop/p/$id', params: { id: ref }, search: { in: within } })
  }
  const deleteProvince = () => {
    if (count > 0 && !confirm(`Take ${name} and its ${count} puzzle${count === 1 ? '' : 's'} out of the campaign? The puzzles stay in your Workshop.`))
      return
    editCampaign(d => removeProvince(d, k), { soon: true })
    if (k > 0) void navigate({ to: '/workshop/c/$id/$n', params: { id: draftId, n: String(k) }, replace: true })
  }

  const addButton = (
    <button ref={addRef} type="button" data-variant="primary" disabled={room === 0} onClick={() => setPicking(true)}>
      + Add puzzle
    </button>
  )

  return (
    <World paper={province.paper} labelledBy={id} style={draftProvinceMorph(k + 1)} start={start} pair={start}>
      <div className={provinceStyles.zoom}>
        <header className={provinceStyles.head}>
          <div className={provinceStyles.title}>
            <p className={provinceStyles.kicker}>
              Province {k + 1}
              {tiers && ' · Tier preview, set for good when you publish'}
            </p>
            <div className={`${provinceStyles.name} ${styles.nameRow}`}>
              <h1 id={id}>
                <EditableText
                  value={draft.name}
                  placeholder={`Province ${k + 1}`}
                  label="Province name"
                  maxLength={MAX_TITLE}
                  onSave={value => editCampaign(d => setProvince(d, k, { name: value }))}
                />
              </h1>
              <PaperChip
                paper={draft.paper}
                fallback="the campaign’s"
                none={{ label: 'Campaign’s', note: 'The campaign’s own paper.' }}
                onChange={paper => editCampaign(d => setProvince(d, k, { paper }))}
              />
            </div>
          </div>
          <CountPill className={provinceStyles.count}>
            {count} / {MAX_PROVINCE_PUZZLES}
          </CountPill>
        </header>
        <div
          className={provinceStyles.shelves}
          style={{ '--shelves': columns.map(c => `minmax(0, ${c}fr)`).join(' ') } as CSSProperties}
        >
          {groups.map(({ tier, slots }, g) => {
            const first = slots[0]?.number
            const last = slots.at(-1)?.number
            return (
              <section key={tier ?? 'all'} className={provinceStyles.shelf} aria-labelledby={`${id}-${tier ?? 'all'}`}>
                <h2 id={`${id}-${tier ?? 'all'}`} className={provinceStyles.tier}>
                  {tier ? TIER_NAME[tier] : 'Puzzles'}
                  {first !== undefined && <small>{first === last ? first : `${first}–${last}`}</small>}
                </h2>
                <ol className={provinceStyles.slots} style={{ '--cols': columns[g], '--rows': rows } as CSSProperties}>
                  {slots.map(({ puzzle, number }) => {
                    const i = number - 1
                    const info = infos.get(puzzle.id)
                    const over = drag?.over && 'slot' in drag.over && drag.over.slot === i ? drag.over.side : undefined
                    const issue = problem(i)
                    return (
                      <li key={`${i}:${puzzle.id}`} data-slot={i} data-ghost={drag?.from === i || undefined} data-drop={over} className={styles.slot}>
                        <Link
                          to="/workshop/p/$id"
                          params={{ id: puzzle.id }}
                          search={{ in: within }}
                          className={campaignStyles.slotLink}
                          draggable={false}
                          aria-label={`${number}: ${puzzle.title}, ${info?.kind ?? 'draft'}${issue ? `, ${PROBLEM[issue].toLowerCase()}` : ''}. Alt and arrows move it.`}
                          onPointerDown={e => onPointerDown(e, i)}
                          onClick={e => consumeDrag() && e.preventDefault()}
                          onKeyDown={e => onSlotKey(e, i)}
                        >
                          <RefFace id={puzzle.id} number={number} info={info} width={puzzle.width} height={puzzle.height} />
                        </Link>
                        {issue && <span className={styles.problem}>{PROBLEM[issue]}</span>}
                        <button
                          type="button"
                          className={styles.remove}
                          aria-label={`Take ${puzzle.title} out of ${name}`}
                          title="Take it out"
                          onClick={() => editCampaign(d => removePuzzle(d, { k, i }), { soon: true })}
                        >
                          ×
                        </button>
                      </li>
                    )
                  })}
                  {plusSlot && g === groups.length - 1 && (
                    <li>
                      <button
                        ref={addRef}
                        type="button"
                        className={styles.plusSlot}
                        aria-label="Add puzzles"
                        data-pad-default={(start && count === 0) || undefined}
                        onClick={() => setPicking(true)}
                      >
                        +
                      </button>
                    </li>
                  )}
                </ol>
              </section>
            )
          })}
        </div>
        <footer className={`${provinceStyles.foot} ${styles.foot}`}>
          {onAddProvince && (
            <button type="button" data-variant="paper" onClick={onAddProvince}>
              + Province
            </button>
          )}
          {!plusSlot && addButton}
          <button
            type="button"
            data-variant="danger"
            data-size="compact"
            className={styles.deleteProvince}
            onClick={deleteProvince}
          >
            <TrashIcon />
            Delete province
          </button>
          <div className={`${provinceStyles.caption} ${styles.flavour}`}>
            <EditableText
              value={draft.flavour}
              placeholder="Add a line players read once it’s conquered"
              label="Flavour line"
              maxLength={MAX_FLAVOUR}
              multiline
              onSave={value => editCampaign(d => setProvince(d, k, { flavour: value }))}
            />
          </div>
        </footer>
      </div>
      {/* On the body: a column clips whatever stands in it. */}
      {drag &&
        createPortal(
          <div className={styles.floater} style={{ left: drag.x, top: drag.y }} aria-hidden="true">
            <RefFace
              id={province.puzzles[drag.from]!.id}
              number={drag.from + 1}
              info={infos.get(province.puzzles[drag.from]!.id)}
              width={province.puzzles[drag.from]!.width}
              height={province.puzzles[drag.from]!.height}
            />
          </div>,
          document.body,
        )}
      {picking && (
        <PuzzlePicker
          entries={entries}
          inThis={new Set(doc.provinces.flatMap(p => p.puzzleIds))}
          province={name}
          count={count}
          room={room}
          restore={addRef}
          onAdd={refs => {
            editCampaign(d => appendPuzzles(d, k, refs), { soon: true })
            setPicking(false)
          }}
          onNew={newPuzzle}
          onClose={() => setPicking(false)}
        />
      )}
    </World>
  )
}

/** A puzzle in the builder: a published one's sticker, a draft's dashed slot. */
function RefFace({
  id,
  number,
  info,
  width,
  height,
}: {
  id: string
  number: number
  info: PuzzleInfo | undefined
  width: number
  height: number
}) {
  if (info?.kind === 'published' && info.picture) {
    return (
      <Slot number={number} width={width} height={height}>
        <Sticker title={info.title} width={width} height={height} palette={info.picture} tilt={tiltOf(id)} />
      </Slot>
    )
  }
  return <Slot number={number} width={width} height={height} className={styles.draftSlot} />
}
