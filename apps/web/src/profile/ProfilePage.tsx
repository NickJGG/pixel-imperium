import { useMemo, useState } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { Nameplate } from '../album/Nameplate.tsx'
import { PageThumb } from '../album/PageThumb.tsx'
import { Sticker, StickerBack, tiltOf } from '../album/Sticker.tsx'
import { VolumeShelf } from '../album/VolumeShelf.tsx'
import { useAccount } from '../account.ts'
import { isOpen, provinceStates } from '../campaign/progress.ts'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { type StickerEntry, profileStickers, showcaseOf } from '../campaign/stickers.ts'
import cover from '../campaign/Cover.module.css'
import { ShowcaseEditor } from './ShowcaseEditor.tsx'
import styles from './Profile.module.css'

const route = getRouteApi('/u/$handle')

const joined = new Intl.DateTimeFormat(undefined, { month: 'short', year: 'numeric' })
const LATEST = 12
/** The showcase's stickers on the cover, biggest first. */
const SHOWCASE = [
  { tilt: -4, width: '38%' },
  { tilt: 5, width: '28%' },
  { tilt: -2, width: '28%' },
]

/** A player's album seen from outside: their cover and showcase, numbers, pages and latest stickers. */
export function ProfilePage() {
  const { profile, campaign, started } = route.useLoaderData()
  const { account, storage } = useAccount()
  const album = useMemo(() => {
    if (!campaign) return null
    const entry = profile.campaigns.find(c => c.id === campaign.id) ?? { verifiedPuzzleIds: [], foilPuzzleIds: [] }
    const verified = new Set(entry.verifiedPuzzleIds)
    return {
      verified,
      progress: provinceStates(campaign, id => verified.has(id)),
      stickers: profileStickers(campaign, entry, storage),
    }
  }, [profile, campaign, storage])
  const own = account?.handle.toLowerCase() === profile.handle.toLowerCase()
  /** The picks being edited, previewed on the cover; `null` when not editing. */
  const [editing, setEditing] = useState<string[] | null>(null)

  const stickers = album?.stickers ?? []
  const { stickers: showcase, picked } = showcaseOf(stickers, editing ?? profile.showcase, editing ? 0 : SHOWCASE.length)
  const total = campaign?.provinces.reduce((n, p) => n + p.puzzles.length, 0) ?? 0
  const complete = album?.progress.provinces.filter(p => p.state === 'conquered').length ?? 0
  const foil = album
    ? album.stickers.filter(s => s.foil).length
    : profile.campaigns.reduce((n, c) => n + c.foilPuzzleIds.length, 0)

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
        </section>

        <div className={styles.side}>
          <dl className={styles.stats}>
            <div>
              <dt>{campaign ? `stickers of ${total}` : 'stickers'}</dt>
              <dd>{album ? album.stickers.length : profile.verifiedSolves}</dd>
            </div>
            <div>
              <dt>foil</dt>
              <dd>{foil}</dd>
            </div>
            {campaign && (
              <div>
                <dt>pages complete</dt>
                <dd>
                  {complete}/{campaign.provinces.length}
                </dd>
              </div>
            )}
            <div>
              <dt>joined</dt>
              <dd className={styles.date}>{joined.format(new Date(profile.joinedAt))}</dd>
            </div>
          </dl>
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
          {own && editing && (
            <ShowcaseEditor stickers={stickers} picks={editing} onChange={setEditing} onClose={() => setEditing(null)} />
          )}

          {started.length > 1 && campaign && (
            <VolumeShelf campaigns={started} current={campaign.id} handle={profile.handle} />
          )}

          {campaign && album && (
            <>
              <section aria-labelledby="pages-title">
                <h2 id="pages-title" className={cover.label}>
                  Pages
                </h2>
                <ol className={cover.thumbs}>
                  {campaign.provinces.map((province, i) => {
                    const { state, solved, total } = album.progress.provinces[i]!
                    const thumb = (
                      <PageThumb
                        name={province.name}
                        index={i}
                        filled={province.puzzles.map(p => album.verified.has(p.id))}
                        locked={!isOpen(state)}
                        complete={state === 'conquered'}
                      />
                    )
                    return (
                      <li key={province.id}>
                        {isOpen(state) ? (
                          <Link
                            to="/u/$handle/$campaignId/$provinceId"
                            params={{ handle: profile.handle, campaignId: campaign.id, provinceId: province.id }}
                            className={cover.thumbLink}
                            aria-label={`${province.name}: ${solved} of ${total} stickers`}
                          >
                            {thumb}
                          </Link>
                        ) : (
                          <span className={cover.thumbLink} role="img" aria-label={`${province.name}: locked`}>
                            {thumb}
                          </span>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </section>

              <section aria-labelledby="latest-title">
                <h2 id="latest-title" className={cover.label}>
                  Latest stickers
                </h2>
                {album.stickers.length > 0 ? (
                  <ul className={styles.latest}>
                    {album.stickers.slice(0, LATEST).map(s => (
                      <li key={s.puzzle.id}>
                        <ProfileSticker sticker={s} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={cover.empty}>Nothing in this volume yet.</p>
                )}
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
