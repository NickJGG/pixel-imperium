/**
 * A draft campaign's column on the Workshop, its cover: title, the publish checks, its Crest, its provinces, and the
 * way into editing them, playtesting and publishing. Publishing confirms first that its puzzles and their order are
 * final from then on.
 */
import { Link, useNavigate } from '@tanstack/react-router'
import { type RefObject, useEffect, useRef, useState } from 'react'
import type { DraftCampaignDoc, DraftCampaignSummary } from '@pixel-imperium/protocol'
import { TrashIcon } from '../album/icons.tsx'
import { paperFor } from '../album/paper.ts'
import { deleteDraftCampaign, publishCampaign } from '../api.ts'
import { World, workshopMorphName } from '../campaign/worlds/Worlds.tsx'
import { forgetWorkshop } from '../content.ts'
import { Crest } from '../home/Crest.tsx'
import { MAX_TITLE } from '../make/draft.ts'
import { type SaveState, forgetDraft } from '../make/draft-store.ts'
import { Badge, FIRST_PICK } from '../make/PublishSheet.tsx'
import { relativeDate } from '../profile/activity.ts'
import { usePadContain } from '../pad/PadProvider.tsx'
import {
  type CampaignChecks,
  MAX_PROVINCES,
  addProvince,
  blankCrest,
  campaignChecks,
  crestColors,
  crestWidth,
  provinceName,
  puzzleTotal,
  ready,
} from './campaign-draft.ts'
import {
  type CampaignKey,
  type StoredCampaign,
  editCampaign,
  flushCampaign,
  flushOnLeave,
  forgetCampaign,
  openCampaign,
  setPreview,
  useCampaign,
  useCampaignSave,
} from './campaign-store.ts'
import { EditableText, PaperChip } from './fields.tsx'
import { titleOf } from './workshop.ts'
import appStyles from '../App.module.css'
import home from '../home/Home.module.css'
import makeStyles from '../make/Make.module.css'
import styles from './Builder.module.css'

const SAVE_NOTE: Record<SaveState, string> = { saved: 'Saved', saving: 'Saving…', local: 'Saved on this device' }

/** A draft campaign: its cover once its doc is loaded (the open column), else what the list knows. */
export function DraftCampaignColumn({
  summary,
  draftKey,
  opening,
  start,
}: {
  summary: DraftCampaignSummary
  draftKey: CampaignKey
  opening: StoredCampaign | null
  start: boolean
}) {
  if (opening) return <DraftCover draftKey={draftKey} opening={opening} start={start} />
  const titleId = `workshop-${summary.id}`
  return (
    <World paper={summary.paper ?? 'workshop'} labelledBy={titleId} style={workshopMorphName(summary.id)} start={start} pair>
      <div className={home.column}>
        <div className={home.stack}>
          <p className={home.kicker}>Your campaign · draft</p>
          <h2 id={titleId} className={home.hero}>
            {titleOf(summary.title)}
          </h2>
          <p className={home.sub}>Last edited {relativeDate(new Date(summary.updatedAt), new Date())}</p>
        </div>
      </div>
    </World>
  )
}

function DraftCover({ draftKey, opening, start }: { draftKey: CampaignKey; opening: StoredCampaign; start: boolean }) {
  useState(() => openCampaign(draftKey, opening))
  useEffect(flushOnLeave, [])
  const { doc, preview } = useCampaign() ?? opening
  const save = useCampaignSave()
  const navigate = useNavigate()
  const checks = campaignChecks(doc, preview)
  const id = draftKey.id
  const titleId = `workshop-${id}`
  const total = puzzleTotal(doc)
  const counts = doc.provinces.map(p => p.puzzleIds.length)

  const remove = async () => {
    if (!confirm(`Delete the draft “${titleOf(doc.title)}”? Its puzzles stay in your Workshop.`)) return
    await deleteDraftCampaign(id).catch(() => {})
    forgetCampaign(draftKey)
    forgetWorkshop()
    void navigate({ to: '/workshop', search: {}, replace: true })
  }

  return (
    <World paper={doc.paper ?? 'workshop'} labelledBy={titleId} style={workshopMorphName(id)} start={start} pair>
      <div className={home.column}>
        <div className={home.stack}>
          <p className={home.kicker} role="status">
            Your campaign · draft · {SAVE_NOTE[save]}
          </p>
          <div className={`${home.hero} ${styles.nameRow}`}>
            <h2 id={titleId}>
              <EditableText
                value={doc.title}
                placeholder="Untitled campaign"
                label="Campaign title"
                maxLength={MAX_TITLE}
                onSave={title => editCampaign(d => ({ ...d, title }))}
              />
            </h2>
            <PaperChip
              paper={doc.paper}
              fallback="pick one to publish"
              none={false}
              onChange={paper => editCampaign(d => ({ ...d, paper }))}
            />
          </div>
          <ChecksPills checks={checks} />
          <ol className={styles.lines} aria-label="Provinces">
            {doc.provinces.map((p, k) => {
              const n = p.puzzleIds.length
              const label = `${provinceName(doc, k)} · ${n > 0 ? `${n} puzzles` : 'empty'}`
              return (
                <li key={k}>
                  <Link
                    to="/workshop/c/$id/$n"
                    params={{ id, n: String(k + 1) }}
                    style={paperFor(p.paper ?? doc.paper ?? 'workshop')}
                    data-empty={n === 0 || undefined}
                    aria-label={label}
                    title={label}
                  />
                </li>
              )
            })}
            {doc.provinces.length < MAX_PROVINCES && (
              <li className={styles.addLine}>
                <Link
                  to="/workshop/c/$id/$n"
                  params={{ id, n: String(doc.provinces.length + 1) }}
                  aria-label="+ Province"
                  title="+ Province"
                  onClick={() => editCampaign(addProvince)}
                />
              </li>
            )}
          </ol>
          <div className={home.actions}>
            {doc.provinces.length > 0 && (
              <Link to="/workshop/c/$id/$n" params={{ id, n: '1' }} data-variant="primary" data-pad-default>
                Edit provinces
              </Link>
            )}
            {total > 0 && (
              <Link to="/workshop/c/$id/playtest/$n" params={{ id, n: '1' }} data-variant="paper">
                ▶ Playtest
              </Link>
            )}
            <div className={styles.publishRow}>
              <PublishCampaignButton draftKey={draftKey} doc={doc} checks={checks} />
              <button type="button" data-variant="danger" onClick={() => void remove()}>
                <TrashIcon />
                Delete
              </button>
            </div>
          </div>
        </div>
        <div className={home.picture}>
          <div className={styles.crestWrap}>
            {doc.crest && crestWidth(doc.crest) > 0 ? (
              <>
                <Crest
                  campaignId={`draft-${id}`}
                  width={crestWidth(doc.crest)}
                  height={doc.crest.rows.length}
                  pixels={crestColors(doc.crest)}
                  marker={null}
                />
                <Link to="/workshop/c/$id/crest" params={{ id }} data-variant="paper" data-size="compact">
                  Edit crest
                </Link>
              </>
            ) : (
              <>
                <p className={home.line}>A Crest is optional: one pixel per puzzle, each revealed as its puzzle is solved.</p>
                <Link
                  to="/workshop/c/$id/crest"
                  params={{ id }}
                  data-variant="paper"
                  data-size="compact"
                  onClick={() => editCampaign(d => ({ ...d, crest: blankCrest(counts, d.paper ?? FIRST_PICK) }))}
                >
                  Add a crest
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    </World>
  )
}

/** Every requirement's pill, then the crest's; dashed while a check is pending, or for no crest. */
function ChecksPills({ checks }: { checks: CampaignChecks }) {
  const { crest } = checks
  return (
    <ul className={styles.pills} aria-label="Ready to publish">
      <li>
        <Badge ok={checks.titled}>{checks.titled ? 'Titled' : 'No title'}</Badge>
      </li>
      <li>
        <Badge ok={checks.paper}>{checks.paper ? 'Paper picked' : 'No paper picked'}</Badge>
      </li>
      <li>
        <Badge ok={checks.filled}>Every province has puzzles</Badge>
      </li>
      <li>
        <Badge ok={checks.pass}>{checks.pass === null ? 'Checking…' : 'Every puzzle passes'}</Badge>
      </li>
      <li>
        {crest ? (
          <Badge ok={crest.fits}>
            Crest {crest.pixels} / {crest.puzzles}
            {!crest.fits && ' · left off unless it fits'}
          </Badge>
        ) : (
          <Badge ok={null}>No crest</Badge>
        )}
      </li>
    </ul>
  )
}

const REFUSED: Record<number, string> = {
  403: 'This account can no longer publish.',
  409: 'One of its puzzles joined another campaign meanwhile.',
  429: 'That’s 3 campaigns published today. Try again tomorrow.',
  422: 'Something in it breaks a rule. The marked puzzles show where.',
}

function PublishCampaignButton({ draftKey, doc, checks }: { draftKey: CampaignKey; doc: DraftCampaignDoc; checks: CampaignChecks }) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  return (
    <>
      <button ref={triggerRef} type="button" data-variant="paper" disabled={!ready(checks)} onClick={() => setOpen(true)}>
        Publish…
      </button>
      {open && (
        <PublishCampaignSheet draftKey={draftKey} doc={doc} restore={triggerRef} onClose={() => setOpen(false)} />
      )}
    </>
  )
}

function PublishCampaignSheet({
  draftKey,
  doc,
  restore,
  onClose,
}: {
  draftKey: CampaignKey
  doc: DraftCampaignDoc
  restore: RefObject<HTMLButtonElement | null>
  onClose: () => void
}) {
  const navigate = useNavigate()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [state, setState] = useState<{ sending: boolean; error: string | null }>({ sending: false, error: null })
  useEffect(() => dialogRef.current?.showModal(), [])
  usePadContain(dialogRef, true, onClose, restore)

  const publish = async () => {
    setState({ sending: true, error: null })
    if (!(await flushCampaign())) {
      setState({ sending: false, error: 'Couldn’t reach the server. Your draft is safe on this device.' })
      return
    }
    const res = await publishCampaign(draftKey.id).catch(() => null)
    if (!res || !('id' in res)) {
      if (res?.preview) setPreview(res.preview)
      setState({ sending: false, error: (res && (REFUSED[res.status] ?? res.error)) ?? 'Couldn’t publish it. Try again in a moment.' })
      return
    }
    for (const p of doc.provinces) for (const ref of p.puzzleIds) forgetDraft({ userId: draftKey.userId, id: ref })
    forgetCampaign(draftKey)
    forgetWorkshop()
    void navigate({ to: '/workshop', search: { open: res.id }, replace: true })
  }

  return (
    <dialog
      ref={dialogRef}
      className={appStyles.dialog}
      aria-labelledby="publish-campaign-title"
      onCancel={e => {
        e.preventDefault()
        onClose()
      }}
    >
      <form
        className={makeStyles.publish}
        onSubmit={e => {
          e.preventDefault()
          void publish()
        }}
      >
        <h2 id="publish-campaign-title">Publish this campaign</h2>
        <p>
          Its puzzles and their order can’t change after publishing; names, flavour lines and papers can. Drafts in it are
          published with it. Anyone with the link can play it.
        </p>
        {state.error && <p role="alert">{state.error}</p>}
        <div className={appStyles.dialogActions}>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" data-variant="primary" disabled={state.sending}>
            {state.sending ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
