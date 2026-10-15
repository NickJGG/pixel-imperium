import { Link } from '@tanstack/react-router'
import type { PlayedCampaign, PlayedPuzzle } from '@pixel-imperium/protocol'
import { Slot } from '../album/Slot.tsx'
import { Sticker, tiltOf } from '../album/Sticker.tsx'
import { paperFor } from '../album/paper.ts'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { type DraftEntry, type PuzzleEntry, titleOf } from './workshop.ts'
import styles from './Workshop.module.css'

/** A draft's slot: dashed in the paper's tab, its size under the pencil. */
export function DraftFace({ draft }: { draft: Pick<DraftEntry, 'width' | 'height'> }) {
  return (
    <span className={styles.draft}>
      <b aria-hidden="true">✎</b>
      <small>
        {draft.width}×{draft.height}
      </small>
    </span>
  )
}

/** One of Yours' puzzles: a published one's sticker, which its Author always has, or a draft's dashed slot. */
export function PuzzleFace({ entry }: { entry: PuzzleEntry }) {
  if (entry.kind === 'draft') return <DraftFace draft={entry} />
  const p = entry.puzzle
  return (
    <Slot number={0} width={p.width} height={p.height}>
      <Sticker title={p.title} width={p.width} height={p.height} palette={p.palette} tilt={tiltOf(p.id)} />
    </Slot>
  )
}

const entryId = (e: PuzzleEntry) => (e.kind === 'draft' ? e.id : e.puzzle.id)

/** Opens one of Yours' puzzles in the editor, or its published page. */
export function PuzzleTile({ entry }: { entry: PuzzleEntry }) {
  const title = titleOf(entry.kind === 'draft' ? entry.title : entry.puzzle.title)
  const state = entry.kind === 'draft' ? 'draft' : entry.puzzle.retired ? 'retired' : null
  return (
    <Link
      to="/workshop/p/$id"
      params={{ id: entryId(entry) }}
      className={styles.tile}
      aria-label={state ? `${title}, ${state}` : title}
    >
      <PuzzleFace entry={entry} />
      <span className={styles.caption}>{state ? `${title} · ${state}` : title}</span>
    </Link>
  )
}

/** Yours' puzzles, the latest first, up to `limit`. */
export function YoursShelf({ entries, limit }: { entries: readonly PuzzleEntry[]; limit?: number }) {
  return (
    <ul className={styles.shelf} aria-label="Your puzzles">
      {entries.slice(0, limit).map(e => (
        <li key={entryId(e)}>
          <PuzzleTile entry={e} />
        </li>
      ))}
    </ul>
  )
}

/** A puzzle played by link: its sticker once solved, else its board so far. */
export function PlayedFace({ puzzle: p, storage }: { puzzle: PlayedPuzzle; storage: ProgressStorage }) {
  const length = p.width * p.height
  if (storage.loadSolved(p.id)) {
    return (
      <Slot number={0} width={p.width} height={p.height}>
        <Sticker
          title={p.title}
          width={p.width}
          height={p.height}
          palette={storage.loadPalette(p.id, length) ?? Array<null>(length).fill(null)}
          foil={storage.loadFoil(p.id)}
          tilt={tiltOf(p.id)}
        />
      </Slot>
    )
  }
  const cells = storage.loadCells(p.id)
  if (cells) return <Slot number={0} width={p.width} height={p.height} cells={cells} />
  return (
    <span className={styles.unplayed}>
      <b aria-hidden="true">?</b>
      <small>
        {p.width}×{p.height}
      </small>
    </span>
  )
}

function PlayedTile({ puzzle: p, storage }: { puzzle: PlayedPuzzle; storage: ProgressStorage }) {
  if (p.removed) {
    return (
      <span className={styles.tile} aria-label="Removed">
        <Slot number={0} width={p.width} height={p.height} />
        <span className={styles.caption}>Removed</span>
      </span>
    )
  }
  return (
    <Link to="/play/$id" params={{ id: p.id }} className={styles.tile} aria-label={`${p.title} by @${p.author}`}>
      <PlayedFace puzzle={p} storage={storage} />
      <span className={styles.caption}>
        {p.title}
        <br />
        by @{p.author}
      </span>
    </Link>
  )
}

function CampaignTile({ campaign: c }: { campaign: PlayedCampaign }) {
  return (
    <Link
      to="/c/$campaignId"
      params={{ campaignId: c.id }}
      className={styles.tile}
      aria-label={`${c.title} by @${c.author}, ${c.solved} of ${c.total} solved`}
    >
      <span className={styles.campaignTile} style={paperFor(c.paper)}>
        {c.solved}/{c.total}
      </span>
      <span className={styles.caption}>
        {c.title}
        <br />
        by @{c.author}
      </span>
    </Link>
  )
}

/** What's been played by link: campaigns, then standalone puzzles, each the latest first. */
export function PlayedShelf({
  puzzles,
  campaigns = [],
  storage,
  limit,
}: {
  puzzles: readonly PlayedPuzzle[]
  campaigns?: readonly PlayedCampaign[]
  storage: ProgressStorage
  limit?: number
}) {
  const items = [
    ...campaigns.map(c => <CampaignTile key={c.id} campaign={c} />),
    ...puzzles.map(p => <PlayedTile key={p.id} puzzle={p} storage={storage} />),
  ].slice(0, limit)
  return (
    <ul className={styles.shelf} aria-label="Played by link">
      {items.map(item => (
        <li key={item.key}>{item}</li>
      ))}
    </ul>
  )
}
