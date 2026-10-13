import type { CSSProperties, ReactNode } from 'react'
import { useParams } from '@tanstack/react-router'
import { paperStyle, seasonStyle } from '../album/paper.ts'
import { currentCampaign } from '../campaign/last-campaign.ts'
import { useAnnounceSkeleton } from '../campaign/worlds/morph-nav.ts'
import { dailyId } from '../daily/clock.ts'
import { boardMorph, columnPaper, slotMorph, slotName } from '../campaign/worlds/names.ts'
import { CrownMark, FloatingPills, HudPills, SoundButton, ThemeButton } from '../Hud.tsx'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { useCentredFilm } from './Filmstrip.tsx'
import { RAIL_WIDTH, useRail } from './layout.ts'
import styles from './Play.module.css'
import skeleton from './PlaySkeleton.module.css'

/** A shell's papers when its province isn't in memory: the fog's. */
const FOG = { '--paper': 'var(--card)', '--tab': 'var(--line-soft)' } as CSSProperties

/** The puzzle's province, place and size in the campaign in memory, if it's there. */
function findPuzzle(id: string) {
  const provinces = currentCampaign()?.provinces ?? []
  for (const [index, province] of provinces.entries()) {
    const number = province.puzzles.findIndex(p => p.id === id) + 1
    if (number > 0) return { index, number, province, puzzle: province.puzzles[number - 1]! }
  }
  return null
}

/**
 * A puzzle while it loads, on its province's paper (the fog without its campaign in memory): the filmstrip, the
 * board and the rail, or the top line, the board and the dock where there's no room for a rail. A Daily is on its
 * Month's season paper, with no filmstrip. With its campaign in memory, it pairs with the province page as Play
 * does, so the board morph can play into it; so does a Daily's board, for its door's.
 */
export function PlaySkeleton() {
  const { id, year, month, day } = useParams({ strict: false })
  const wide = useRail()
  useAnnounceSkeleton()
  const found = id === undefined ? null : findPuzzle(id)
  const paper = found ? paperStyle(found.index) : month !== undefined ? seasonStyle(Number(month)) : FOG
  const paperMorph = columnPaper(found ? `province-${found.province.id}` : undefined)
  const daily = year !== undefined && month !== undefined && day !== undefined ? dailyId(`${year}-${month}-${day}`) : undefined
  const board = (
    <BoardGhost
      width={found?.puzzle.width ?? 15}
      height={found?.puzzle.height ?? 15}
      name={found ? slotName(found.puzzle.id) : daily && slotName(daily)}
    />
  )

  return (
    <main
      className={styles.shell}
      data-rail={wide || undefined}
      {...paperMorph}
      style={{ ...paper, ...paperMorph.style }}
      aria-busy="true"
    >
      <SrLoading />
      {wide && <FloatingPills />}
      {!wide && (
        <header className={styles.topLine}>
          <Bar w={28} h={18} />
          <Bar w="min(220px, 40%)" h={18} />
          <span className={styles.topTools}>
            <SoundButton className={styles.round} variant="flat" size="compact" />
            <ThemeButton className={styles.round} variant="flat" size="compact" />
          </span>
        </header>
      )}
      <div className={styles.shellBody}>
        {wide && month === undefined && (
          <Film
            count={found?.province.puzzles.length ?? 12}
            current={(found?.number ?? 1) - 1}
            ids={found?.province.puzzles.map(p => p.id)}
            head={<Bar w={32} h={10} />}
            caption={false}
          />
        )}
        <Surface>{board}</Surface>
        {wide && (
          <Rail underPills>
            <div className={styles.railHead}>
              <Bar w={110} h={30} pill style={{ marginBottom: 'var(--space-4)' }} />
              <Bar w={90} h={12} style={{ marginBottom: 'var(--space-1)' }} />
              <Bar w={200} h={34} />
              <div className={styles.railBadges}>
                <Bar w={52} h={22} pill />
              </div>
            </div>
            <div className={styles.railBody}>
              <Bar w="100%" h={44} pill />
              <div className={styles.hintCard}>
                <Bar w="100%" h={52} pill />
                <Bar w="100%" h={60} />
              </div>
              <div className={styles.railFoot}>
                <div className={styles.btnRow}>
                  <Bar w="100%" h={44} pill />
                  <Bar w="100%" h={44} pill />
                </div>
              </div>
            </div>
          </Rail>
        )}
      </div>
      {!wide && (
        <div className={styles.playDock}>
          <Bar w="min(320px, 100%)" h={44} pill />
        </div>
      )}
    </main>
  )
}

/** The board's surface, holding a `BoardGhost`. */
export function Surface({ children }: { children: ReactNode }) {
  return (
    <div className={styles.surface} {...boardMorph('surface', 'surface')}>
      <div className={`${styles.stage} ${skeleton.stage}`}>{children}</div>
    </div>
  )
}

/** A board of `width`×`height` cells: bars for its clues and a dashed grid. `name` pairs it as the board. */
export function BoardGhost({ width, height, name }: { width: number; height: number; name?: string | undefined }) {
  const depth = Math.ceil(Math.max(width, height) * 0.3)
  const morph = name === undefined ? undefined : boardMorph(name)
  const lines = (n: number, long: boolean) =>
    Array.from({ length: n }, (_, i) => (
      <span key={i}>
        <Bar w={long ? '45%' : '55%'} h={long ? '55%' : '45%'} />
      </span>
    ))
  return (
    <div
      className={skeleton.board}
      {...morph}
      style={{ '--w': width, '--h': height, '--d': depth, ...morph?.style } as CSSProperties}
    >
      <span />
      <div className={skeleton.cols}>{lines(width, false)}</div>
      <div className={skeleton.rows}>{lines(height, true)}</div>
      <Ghost style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

/**
 * The filmstrip: the crown, `head` where the name and count go, and `count` slots with the `current` one ringed,
 * over its `caption` unless that's off. With the puzzles' `ids`, the others pair with their slots as the Filmstrip's do.
 */
export function Film({
  count,
  current,
  head,
  ids,
  caption = true,
}: {
  count: number
  current: number
  head: ReactNode
  ids?: readonly string[] | undefined
  caption?: boolean
}) {
  const { listRef, currentRef } = useCentredFilm()
  const slot = <Ghost style={{ width: 64, aspectRatio: 1 }} />
  return (
    <div className={styles.film} aria-hidden="true" {...boardMorph('film', 'film')}>
      <span className={styles.filmMark}>
        <CrownMark />
      </span>
      <div className={styles.filmHead}>{head}</div>
      <ol ref={listRef} className={styles.filmSlots}>
        {Array.from({ length: count }, (_, i) =>
          i === current ? (
            <li key={i} ref={currentRef} className={styles.filmCurrent}>
              {slot}
              {caption && <Bar w={48} h={10} />}
            </li>
          ) : (
            <li key={i} {...(ids?.[i] !== undefined && slotMorph(ids[i]))}>
              {slot}
            </li>
          ),
        )}
      </ol>
    </div>
  )
}

const railMorph = boardMorph('rail', 'rail')

/** The right rail, topped by the HUD's pills, or with `underPills` clearing the ones floating over the page. */
export function Rail({ underPills = false, children }: { underPills?: boolean; children: ReactNode }) {
  return (
    <aside
      className={underPills ? `${styles.rail} ${styles.underPills}` : styles.rail}
      {...railMorph}
      style={{ ...railMorph.style, width: RAIL_WIDTH }}
    >
      {!underPills && <HudPills className={styles.railPills} />}
      {children}
    </aside>
  )
}
