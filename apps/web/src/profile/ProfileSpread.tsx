import { useMemo } from 'react'
import { Link, getRouteApi } from '@tanstack/react-router'
import { Slot } from '../album/Slot.tsx'
import { Spread } from '../album/Spread.tsx'
import { useAccount } from '../account.ts'
import { isOpen, provinceStates } from '../campaign/progress.ts'
import { GOLD_SLOT } from '../campaign/PuzzleSlot.tsx'
import { profileStickers } from '../campaign/stickers.ts'
import list from '../campaign/Campaign.module.css'
import { ProfileSticker } from './ProfilePage.tsx'

const route = getRouteApi('/u/$handle/$campaignId/$provinceId')

/** Another player's province spread, to look through but not play from. */
export function ProfileSpread() {
  const { profile, campaign, province } = route.useLoaderData()
  const { storage } = useAccount()
  const index = campaign.provinces.indexOf(province)
  const { state, solved, stickers } = useMemo(() => {
    const ids = profile.campaigns.find(c => c.id === campaign.id)?.verifiedPuzzleIds ?? []
    const verified = new Set(ids)
    return {
      ...provinceStates(campaign, id => verified.has(id)).provinces[index]!,
      stickers: new Map(profileStickers(campaign, ids, storage).map(s => [s.puzzle.id, s])),
    }
  }, [profile, campaign, index, storage])

  return (
    <main className={list.page}>
      <Link to="/u/$handle" params={{ handle: profile.handle }} search={{ c: campaign.id }} className={list.back}>
        ← @{profile.handle}’s album
      </Link>
      <Spread
        province={province}
        index={index}
        solved={solved}
        complete={state === 'conquered'}
        caption={state === 'conquered' ? province.flavour || undefined : undefined}
        readOnly
        slot={(p, number) => {
          const sticker = stickers.get(p.id)
          return sticker ? (
            <Slot number={number} width={p.width} height={p.height}>
              <ProfileSticker sticker={sticker} />
            </Slot>
          ) : (
            <Slot number={number} width={p.width} height={p.height} gold={number === GOLD_SLOT} locked={!isOpen(state)} />
          )
        }}
      />
    </main>
  )
}
