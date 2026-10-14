import { useMemo, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import type { ProfileCampaign } from '@pixel-imperium/protocol'
import { HandleHero } from '../album/HandleHero.tsx'
import { useAccount } from '../account.ts'
import { SHOWCASE_SIZE, profileStickers, showcaseOf } from '../campaign/stickers.ts'
import { World, Worlds } from '../campaign/worlds/Worlds.tsx'
import { solveTime, solveTimes } from '../daily/clock.ts'
import { albumPages, albumProvinces } from './album.ts'
import { Showcase } from './Showcase.tsx'
import { ShowcaseEditor } from './ShowcaseEditor.tsx'
import { Stamps, stampsOf } from './Stamps.tsx'
import { Summary } from './Summary.tsx'
import styles from './Profile.module.css'

const route = getRouteApi('/u/$handle')

const NO_SOLVES: ProfileCampaign = { id: '', verifiedPuzzleIds: [], foilPuzzleIds: [], solvedAt: {}, stamps: [] }

/**
 * A player's album seen from outside, as Worlds columns: the cobalt Cover with their handle and showcase, their
 * Record, and their Stamps. An album is a Campaign or a Year of Dailies. Editing your showcase swaps Record and
 * Stamps for the picker.
 */
export function ProfilePage() {
  const { profile, album, tabs } = route.useLoaderData()
  const { account, storage } = useAccount()
  const [now] = useState(() => new Date())
  const streakTimes = useMemo(() => solveTimes([...profile.campaigns, ...profile.years]), [profile])
  const record = useMemo(() => {
    if (!album) return null
    const entries = album.kind === 'campaign' ? profile.campaigns : profile.years
    const entry = entries.find(e => e.id === album.id) ?? NO_SOLVES
    const verified = new Set(entry.verifiedPuzzleIds)
    const foil = new Set(entry.foilPuzzleIds)
    return {
      entry,
      pages: albumPages(album, id => verified.has(id)),
      stickers: profileStickers({ provinces: albumProvinces(album) }, entry, storage),
      solves: entry.verifiedPuzzleIds.flatMap(id => {
        const at = entry.solvedAt[id]
        return at ? [{ at: solveTime(id, at), foil: foil.has(id) }] : []
      }),
    }
  }, [profile, album, storage])
  const own = account?.handle.toLowerCase() === profile.handle.toLowerCase()
  const stickers = record?.stickers ?? []
  const picks = () => showcaseOf(stickers, profile.showcase, 0).stickers.map(s => s.puzzle.id)
  const { edit, c } = route.useSearch()
  const navigate = route.useNavigate()
  /** The picks being edited, previewed on the cover; `null` when not editing. */
  const [editing, setEditing] = useState<string[] | null>(() => (edit && own && stickers.length > 0 ? picks() : null))
  const stopEditing = () => {
    setEditing(null)
    if (edit) void navigate({ search: c ? { c } : {}, replace: true })
  }

  const { stickers: showcase, picked } = showcaseOf(stickers, editing ?? profile.showcase, editing ? 0 : SHOWCASE_SIZE)
  const first = album?.kind === 'campaign' ? album.campaign.provinces[0] : undefined
  const stamps = album ? stampsOf(album) : []
  const earned = record ? stamps.filter(s => record.entry.stamps.some(e => e.id === s.id)).length : 0

  return (
    <main className={styles.page}>
      <Worlds>
        <World paper="marches" className={styles.cover}>
          <div className={styles.column} data-surface="cobalt">
            {tabs.length > 1 && album ? (
              <nav className={styles.tabs} aria-label="Albums">
                {tabs.map(c => (
                  <Link
                    key={c.id}
                    to="/u/$handle"
                    params={{ handle: profile.handle }}
                    search={{ c: c.id }}
                    aria-current={c.id === album.id ? 'page' : undefined}
                  >
                    {c.name}
                  </Link>
                ))}
              </nav>
            ) : (
              album && <p className={styles.kicker}>Album · {album.name}</p>
            )}
            <HandleHero handle={profile.handle} />
            <Showcase stickers={showcase} />
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
                    onClick={() => setEditing(picks())}
                  >
                    Edit showcase
                  </button>
                ) : (
                  album &&
                  first && (
                    <Link to="/c/$campaignId" params={{ campaignId: album.id }} data-variant="primary">
                      Start {first.name.replace(/^The /, 'the ')}
                    </Link>
                  )
                )}
              </div>
            )}
          </div>
        </World>

        {album &&
          record &&
          (own && editing ? (
            <World paper="capital" style={{ flex: '2 1 0' }} labelledBy="showcase-edit-title">
              <div className={styles.column}>
                <ShowcaseEditor stickers={stickers} picks={editing} onChange={setEditing} onClose={stopEditing} />
              </div>
            </World>
          ) : (
            <>
              <World paper="coast" labelledBy="record-title">
                <div className={styles.column}>
                  <Summary
                    titleId="record-title"
                    pages={record.pages}
                    pageWord={album.kind === 'campaign' ? 'Pages' : 'Months'}
                    stickers={record.stickers}
                    solves={record.solves}
                    streakTimes={streakTimes}
                    joinedAt={profile.joinedAt}
                    now={now}
                  />
                </div>
              </World>
              <World paper="capital" labelledBy="stamps-title">
                <div className={styles.column}>
                  <h2 id="stamps-title" className={styles.kicker}>
                    Stamps · {earned} / {stamps.length}
                  </h2>
                  <Stamps album={album} earned={record.entry.stamps} now={now} />
                </div>
              </World>
            </>
          ))}
      </Worlds>
    </main>
  )
}
