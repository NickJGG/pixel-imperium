import { useMemo, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import type { ProfileCampaign } from '@pixel-imperium/protocol'
import { Nameplate } from '../album/Nameplate.tsx'
import { Sticker, StickerBack, tiltOf } from '../album/Sticker.tsx'
import { VolumeShelf } from '../album/VolumeShelf.tsx'
import { useAccount } from '../account.ts'
import { provinceStates } from '../campaign/progress.ts'
import { ProvinceIndex } from '../campaign/ProvinceIndex.tsx'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { type StickerEntry, profileStickers, showcaseOf } from '../campaign/stickers.ts'
import cover from '../campaign/Cover.module.css'
import { relativeDate } from './activity.ts'
import { ShowcaseEditor } from './ShowcaseEditor.tsx'
import { Stamps } from './Stamps.tsx'
import { Summary } from './Summary.tsx'
import styles from './Profile.module.css'

const route = getRouteApi('/u/$handle')

const LATEST = 12
/** The showcase's stickers on the cover, biggest first. */
const SHOWCASE = [
  { tilt: -4, width: '38%' },
  { tilt: 5, width: '28%' },
  { tilt: -2, width: '28%' },
]
const NO_SOLVES: ProfileCampaign = { id: '', verifiedPuzzleIds: [], foilPuzzleIds: [], solvedAt: {}, stamps: [] }

/** A player's album seen from outside: their cover with showcase and pages, numbers, latest stickers and Stamps. */
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
      verified,
      foil,
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

  return (
    <main className={cover.page}>
      <div className={styles.profile}>
        <section className={`${cover.cover} ${styles.cover}`} aria-labelledby="profile-title">
          <h1 id="profile-title" className={styles.plate}>
            <Nameplate handle={profile.handle} />
          </h1>
          {showcase.length > 0 ? (
            <>
              <ul className={styles.showcase} aria-label="Showcase">
                {showcase.map((s, i) => (
                  <li key={s.puzzle.id} style={{ width: SHOWCASE[i]!.width }}>
                    <ProfileSticker sticker={s} tilt={SHOWCASE[i]!.tilt} />
                  </li>
                ))}
              </ul>
              <p className={styles.caption}>
                {editing
                  ? 'Your picks'
                  : `${picked ? 'Showcase · picked by' : 'Latest stickers ·'} @${profile.handle}`}
              </p>
            </>
          ) : (
            <p className={styles.caption}>{editing ? 'Tap stickers to pick them.' : 'No stickers yet.'}</p>
          )}
          {own && (
            <div className={styles.actions}>
              {stickers.length > 0 && !editing && (
                <button
                  type="button"
                  onClick={() => setEditing(showcaseOf(stickers, profile.showcase, 0).stickers.map(s => s.puzzle.id))}
                >
                  Edit showcase
                </button>
              )}
              <Link to="/settings" className={`${cover.pill} ${styles.settings}`}>
                Settings
              </Link>
            </div>
          )}
          {campaign && album && (
            <ProvinceIndex
              campaign={campaign}
              progress={album.progress}
              name={(province, open) =>
                open ? (
                  <Link
                    to="/u/$handle/$campaignId/$provinceId"
                    params={{ handle: profile.handle, campaignId: campaign.id, provinceId: province.id }}
                  >
                    {province.name}
                  </Link>
                ) : (
                  <span>{province.name}</span>
                )
              }
              slots={province =>
                province.puzzles.map(p => (album.foil.has(p.id) ? 'foil' : album.verified.has(p.id) ? 'filled' : 'empty'))
              }
            />
          )}
        </section>

        <div className={styles.side}>
          {campaign && album && (
            <Summary
              campaign={campaign}
              progress={album.progress}
              stickers={album.stickers}
              solves={album.solves}
              joinedAt={profile.joinedAt}
              now={now}
            />
          )}
          {own && editing && (
            <ShowcaseEditor stickers={stickers} picks={editing} onChange={setEditing} onClose={() => setEditing(null)} />
          )}

          {started.length > 1 && campaign && (
            <VolumeShelf campaigns={started} current={campaign.id} handle={profile.handle} />
          )}

          {campaign && album && (
            <>
              <section aria-labelledby="latest-title">
                <h2 id="latest-title" className={cover.label}>
                  Latest stickers
                </h2>
                {album.stickers.length > 0 ? (
                  <ul className={styles.latest}>
                    {album.stickers.slice(0, LATEST).map(s => {
                      const at = album.entry.solvedAt[s.puzzle.id]
                      return (
                        <li key={s.puzzle.id}>
                          <ProfileSticker sticker={s} />
                          {at && <time dateTime={at}>{relativeDate(new Date(at), now)}</time>}
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className={cover.empty}>Nothing in this volume yet.</p>
                )}
              </section>

              <section aria-labelledby="stamps-title">
                <h2 id="stamps-title" className={cover.label}>
                  Stamps
                </h2>
                <Stamps campaign={campaign} earned={album.entry.stamps} now={now} />
              </section>
            </>
          )}
        </div>
      </div>
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
