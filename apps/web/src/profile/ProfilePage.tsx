import { useMemo, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import type { ProfileCampaign } from '@pixel-imperium/protocol'
import { HandleHero } from '../album/HandleHero.tsx'
import { Sticker, StickerBack, tiltOf } from '../album/Sticker.tsx'
import { useAccount } from '../account.ts'
import { provinceStates } from '../campaign/progress.ts'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { type StickerEntry, profileStickers, showcaseOf } from '../campaign/stickers.ts'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { ShowcaseEditor } from './ShowcaseEditor.tsx'
import { Stamps, stampsOf } from './Stamps.tsx'
import { Summary } from './Summary.tsx'
import styles from './Profile.module.css'

const route = getRouteApi('/u/$handle')

/** The showcase's stickers on the cover, biggest first. */
const SHOWCASE = [
  { tilt: -4, width: '38%' },
  { tilt: 5, width: '28%' },
  { tilt: -2, width: '28%' },
]
const NO_SOLVES: ProfileCampaign = { id: '', verifiedPuzzleIds: [], foilPuzzleIds: [], solvedAt: {}, stamps: [] }

/**
 * A player's album seen from outside, as Worlds columns: the cobalt Cover with their handle and showcase, their
 * Record, and their Stamps. Editing your showcase swaps Record and Stamps for the picker.
 */
export function ProfilePage() {
  const { profile, campaign, started } = route.useLoaderData()
  const { account, storage } = useAccount()
  const [now] = useState(() => new Date())
  const album = useMemo(() => {
    if (!campaign) return null
    const entry = profile.campaigns.find(c => c.id === campaign.id) ?? NO_SOLVES
    const verified = new Set(entry.verifiedPuzzleIds)
    const foil = new Set(entry.foilPuzzleIds)
    return {
      entry,
      progress: provinceStates(campaign, id => verified.has(id)),
      stickers: profileStickers(campaign, entry, storage),
      solves: entry.verifiedPuzzleIds.flatMap(id => {
        const at = entry.solvedAt[id]
        return at ? [{ at: new Date(at), foil: foil.has(id) }] : []
      }),
    }
  }, [profile, campaign, storage])
  const own = account?.handle.toLowerCase() === profile.handle.toLowerCase()
  /** The picks being edited, previewed on the cover; `null` when not editing. */
  const [editing, setEditing] = useState<string[] | null>(null)

  const stickers = album?.stickers ?? []
  const { stickers: showcase, picked } = showcaseOf(stickers, editing ?? profile.showcase, editing ? 0 : SHOWCASE.length)
  const first = campaign?.provinces[0]
  const stamps = campaign ? stampsOf(campaign) : []
  const earned = album ? stamps.filter(s => album.entry.stamps.some(e => e.id === s.id)).length : 0

  return (
    <main className={styles.page}>
      <Worlds>
        <World index={0} className={styles.cover}>
          <div className={styles.column} data-surface="cobalt">
            {started.length > 1 && campaign ? (
              <nav className={styles.tabs} aria-label="Albums">
                {started.map(c => (
                  <Link
                    key={c.id}
                    to="/u/$handle"
                    params={{ handle: profile.handle }}
                    search={{ c: c.id }}
                    aria-current={c.id === campaign.id ? 'page' : undefined}
                  >
                    {c.name}
                  </Link>
                ))}
              </nav>
            ) : (
              campaign && <p className={styles.kicker}>Album · {campaign.name}</p>
            )}
            <HandleHero handle={profile.handle} />
            {showcase.length > 0 ? (
              <ul className={styles.showcase} aria-label="Showcase">
                {showcase.map((s, i) => (
                  <li key={s.puzzle.id} style={{ width: SHOWCASE[i]!.width }}>
                    <ProfileSticker sticker={s} tilt={SHOWCASE[i]!.tilt} />
                  </li>
                ))}
              </ul>
            ) : (
              <ul className={styles.showcase} aria-hidden="true">
                {SHOWCASE.map(({ width }, i) => (
                  <li key={i} style={{ width }}>
                    <span className={styles.empty} />
                  </li>
                ))}
              </ul>
            )}
            <p className={styles.kicker}>
              {editing
                ? showcase.length > 0
                  ? 'Your picks'
                  : 'Tap stickers to pick them.'
                : showcase.length > 0
                  ? `${picked ? 'Showcase · picked by' : 'Latest stickers ·'} @${profile.handle}`
                  : own
                    ? 'Your first sticker lands here.'
                    : 'No stickers yet.'}
            </p>
            {own && !editing && (
              <div className={styles.actions}>
                {stickers.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setEditing(showcaseOf(stickers, profile.showcase, 0).stickers.map(s => s.puzzle.id))}
                  >
                    Edit showcase
                  </button>
                ) : (
                  campaign &&
                  first && (
                    <Link to="/c/$campaignId" params={{ campaignId: campaign.id }} data-variant="primary">
                      Start {first.name.replace(/^The /, 'the ')}
                    </Link>
                  )
                )}
              </div>
            )}
          </div>
        </World>

        {campaign &&
          album &&
          (own && editing ? (
            <World index={4} style={{ flex: '2 1 0' }} labelledBy="showcase-edit-title">
              <div className={styles.column}>
                <ShowcaseEditor stickers={stickers} picks={editing} onChange={setEditing} onClose={() => setEditing(null)} />
              </div>
            </World>
          ) : (
            <>
              <World index={1} labelledBy="record-title">
                <div className={styles.column}>
                  <Summary
                    titleId="record-title"
                    campaign={campaign}
                    progress={album.progress}
                    stickers={album.stickers}
                    solves={album.solves}
                    joinedAt={profile.joinedAt}
                    now={now}
                  />
                </div>
              </World>
              <World index={4} labelledBy="stamps-title">
                <div className={styles.column}>
                  <h2 id="stamps-title" className={styles.kicker}>
                    Stamps · {earned} / {stamps.length}
                  </h2>
                  <Stamps campaign={campaign} earned={album.entry.stamps} now={now} />
                </div>
              </World>
            </>
          ))}
      </Worlds>
    </main>
  )
}

/** Their sticker, face down unless the viewer has collected it too. */
export function ProfileSticker({ sticker: s, tilt }: { sticker: StickerEntry; tilt?: number }) {
  const { puzzle } = s
  const lean = tilt ?? tiltOf(puzzle.id)
  if (!s.palette) {
    return (
      <span role="img" aria-label={`#${s.number}, a sticker you haven't collected`} className={styles.fill}>
        <StickerBack width={puzzle.width} height={puzzle.height} tilt={lean} />
      </span>
    )
  }
  return (
    <Sticker
      title={puzzle.title}
      width={puzzle.width}
      height={puzzle.height}
      palette={s.palette}
      foil={s.foil}
      gold={s.number === GOLD_SLOT}
      tilt={lean}
    />
  )
}
