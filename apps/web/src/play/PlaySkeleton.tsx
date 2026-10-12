import { type CSSProperties, type ReactNode, useLayoutEffect, useRef } from 'react'
import { useParams } from '@tanstack/react-router'
import { paperStyle, seasonStyle } from '../album/paper.ts'
import { currentCampaign } from '../campaign/last-campaign.ts'
import { CrownMark, HudPills, SoundButton, ThemeButton } from '../Hud.tsx'
import { Bar, Ghost, SrLoading } from '../skeleton/Skeleton.tsx'
import { SlidersIcon } from './AssistsDisclosure.tsx'
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
    if (number > 0) return { index, number, count: province.puzzles.length, puzzle: province.puzzles[number - 1]! }
  }
  return null
}

/**
 * A puzzle while it loads, on its province's paper (the fog without its campaign in memory): the filmstrip, the
 * board and the rail, or the top line, the board and the dock where there's no room for a rail. A Daily is on its
 * Month's season paper, with no filmstrip.
 */
export function PlaySkeleton() {
  const { id, month } = useParams({ strict: false })
  const wide = useRail()
  const found = id === undefined ? null : findPuzzle(id)
  const paper = found ? paperStyle(found.index) : month !== undefined ? seasonStyle(Number(month)) : FOG
  const board = <BoardGhost width={found?.puzzle.width ?? 15} height={found?.puzzle.height ?? 15} />

  return (
    <main
      className={styles.shell}
      data-rail={wide || undefined}
      style={paper}
      aria-busy="true"
    >
      <SrLoading />
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
            count={found?.count ?? 12}
            current={(found?.number ?? 1) - 1}
            head={
              <>
                <Bar w={64} h={10} />
                <Bar w={32} h={10} style={{ marginTop: 'var(--space-1)' }} />
              </>
            }
          />
        )}
        <Surface>{board}</Surface>
        {wide && (
          <Rail>
            <div className={styles.railTitle}>
              <Bar w={120} h={12} />
              <Bar w={200} h={30} />
              <Bar w={90} h={12} />
            </div>
            <div className={styles.progress}>
              <span>
                Progress <Bar w={32} h={12} />
              </span>
              <Bar w="100%" h={8} pill />
            </div>
            <div className={styles.panelBody}>
              <Bar w="100%" h={48} pill />
              <div className={styles.btnRow}>
                <Bar w="100%" h={44} pill />
                <Bar w="100%" h={44} pill />
              </div>
              <Bar w="100%" h={44} pill />
              <div className={styles.disclosure} inert>
                <button type="button">
                  <SlidersIcon />
                  Assists
                </button>
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
    <div className={styles.surface}>
      <div className={`${styles.stage} ${skeleton.stage}`}>{children}</div>
    </div>
  )
}

/** A board of `width`×`height` cells: bars for its clues and a dashed grid. */
export function BoardGhost({ width, height }: { width: number; height: number }) {
  const depth = Math.ceil(Math.max(width, height) * 0.3)
  const lines = (n: number, long: boolean) =>
    Array.from({ length: n }, (_, i) => (
      <span key={i}>
        <Bar w={long ? '45%' : '55%'} h={long ? '55%' : '45%'} />
      </span>
    ))
  return (
    <div className={skeleton.board} style={{ '--w': width, '--h': height, '--d': depth } as CSSProperties}>
      <span />
      <div className={skeleton.cols}>{lines(width, false)}</div>
      <div className={skeleton.rows}>{lines(height, true)}</div>
      <Ghost style={{ width: '100%', height: '100%' }} />
    </div>
  )
}

/** The filmstrip: the crown, `head` where the name and count go, and `count` slots with the `current` one ringed. */
export function Film({ count, current, head }: { count: number; current: number; head: ReactNode }) {
  const listRef = useRef<HTMLOListElement>(null)
  const currentRef = useRef<HTMLLIElement>(null)
  useLayoutEffect(() => {
    const list = listRef.current!
    const item = currentRef.current!
    list.scrollTop = item.offsetTop - (list.clientHeight - item.offsetHeight) / 2
  }, [])
  const slot = <Ghost style={{ width: 64, aspectRatio: 1 }} />
  return (
    <div className={styles.film} aria-hidden="true">
      <span className={styles.filmMark}>
        <CrownMark />
      </span>
      <div className={styles.filmHead}>{head}</div>
      <ol ref={listRef} className={styles.filmSlots}>
        {Array.from({ length: count }, (_, i) =>
          i === current ? (
            <li key={i} ref={currentRef} className={styles.filmCurrent}>
              {slot}
              <Bar w={48} h={10} />
            </li>
          ) : (
            <li key={i}>{slot}</li>
          ),
        )}
      </ol>
    </div>
  )
}

/** The right rail, under the HUD's pills. */
export function Rail({ children }: { children: ReactNode }) {
  return (
    <aside className={styles.rail} style={{ width: RAIL_WIDTH }}>
      <HudPills className={styles.railPills} />
      {children}
    </aside>
  )
}
