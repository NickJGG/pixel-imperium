import { type CSSProperties, type PointerEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { addColor, recolor, removeColor } from './draft.ts'
import { beginStroke, commit, endStroke, getDraft, strokeStart, strokeTo } from './draft-store.ts'
import { QUICK_PICKS } from './quick-picks.ts'
import playStyles from '../play/Play.module.css'
import styles from './Make.module.css'

interface Hsv {
  h: number
  s: number
  v: number
}

const HEX = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i

function toHex({ h, s, v }: Hsv): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
    return Math.round(c * 255)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(5)}${f(3)}${f(1)}`
}

function toHsv(hex: string, hue = 0): Hsv {
  const n = parseInt(hex.slice(1), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => c / 255) as [number, number, number]
  const v = Math.max(r, g, b)
  const d = v - Math.min(r, g, b)
  if (d === 0) return { h: hue, s: 0, v }
  const h = v === r ? ((g - b) / d + 6) % 6 : v === g ? (b - r) / d + 2 : (r - g) / d + 4
  return { h: h * 60, s: d / v, v }
}

/** `text` as a lowercase #rrggbb, or null when it isn't a hex. */
function readHex(text: string): string | null {
  const m = HEX.exec(text.trim())
  if (!m) return null
  const digits = m[1]!.length === 3 ? [...m[1]!].map(c => c + c).join('') : m[1]!
  return `#${digits.toLowerCase()}`
}

const clamp01 = (n: number) => Math.min(Math.max(n, 0), 1)

interface Props {
  /** The color being edited, or null for a new one. */
  target: string | null
  /** What opened the sheet, which it lines up beside. Presses inside `[data-sheet-anchor]` don't close it. */
  anchor: HTMLElement
  onChoose: (color: string) => void
  onClose: () => void
}

/**
 * The strip's color sheet: a new color from "+", or the chosen chip's color to change. An edit shows live on
 * the drawing as one undoable step, kept by Done or a press outside and undone by Escape.
 */
export function ColorSheet({ target, anchor, onChoose, onClose }: Props) {
  const [hsv, setHsv] = useState<Hsv>(() =>
    toHsv(target ?? QUICK_PICKS.find(c => !getDraft().colors.includes(c)) ?? QUICK_PICKS[0]),
  )
  const hex = toHex(hsv)
  const [text, setText] = useState(hex)
  const rootRef = useRef<HTMLDivElement>(null)
  const [top, setTop] = useState(0)

  /** Lands the edit as one step; safe to call twice. */
  const finish = useRef(() => {})
  useEffect(() => {
    if (target === null) return
    beginStroke()
    let open = true
    finish.current = () => {
      if (open) endStroke()
      open = false
    }
    return () => finish.current()
  }, [target])

  const revert = () => {
    const base = strokeStart()
    if (base) strokeTo(base)
    if (target) onChoose(target)
  }

  const close = (keep: boolean) => {
    if (!keep) revert()
    finish.current()
    onClose()
  }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      closeRef.current(false)
    }
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as Element
      if (!rootRef.current?.contains(t) && !t.closest('[data-sheet-anchor]')) closeRef.current(true)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown, true)
    }
  }, [])

  useLayoutEffect(() => {
    const sheet = rootRef.current!
    const parent = sheet.offsetParent!.getBoundingClientRect()
    const want = anchor.getBoundingClientRect().top - parent.top - 8
    const room = innerHeight - 8 - parent.top - sheet.offsetHeight
    setTop(Math.max(Math.min(want, room), 8 - parent.top))
  }, [])

  const taken = (c: string) => c !== target && getDraft().colors.includes(c)

  const set = (next: Hsv, typed?: string) => {
    setHsv(next)
    const c = toHex(next)
    setText(typed ?? c)
    const base = strokeStart()
    if (target === null || !base) return
    if (taken(c)) return revert()
    strokeTo(recolor(base, target, c))
    onChoose(c)
  }

  const setHex = (c: string, typed?: string) => set(toHsv(c, hsv.h), typed)

  const drag = (e: PointerEvent<HTMLElement>, at: (x: number, y: number) => void) => {
    if (e.button !== 0) return
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    const move = (ev: { clientX: number; clientY: number }) => {
      const r = el.getBoundingClientRect()
      at(clamp01((ev.clientX - r.left) / r.width), clamp01((ev.clientY - r.top) / r.height))
    }
    move(e)
    const up = () => {
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  const clash = taken(hex)

  return (
    <div
      ref={rootRef}
      className={`${playStyles.sheetFace} ${styles.sheet}`}
      style={{ top, '--hue': hsv.h } as CSSProperties}
      role="dialog"
      aria-label={target === null ? 'New color' : 'Edit color'}
    >
      <p className={playStyles.sheetHead}>{target === null ? 'New color' : 'Edit color'}</p>
      <div
        className={styles.sv}
        role="presentation"
        onPointerDown={e => drag(e, (x, y) => set({ h: hsv.h, s: x, v: 1 - y }))}
      >
        <b style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }} />
      </div>
      <div className={styles.hue} role="presentation" onPointerDown={e => drag(e, x => set({ ...hsv, h: x * 360 }))}>
        <b style={{ left: `${(hsv.h / 360) * 100}%` }} />
      </div>
      <label className={styles.hexRow}>
        <i style={{ background: hex }} />
        <input
          aria-label="Hex"
          value={text}
          spellCheck={false}
          maxLength={7}
          onChange={e => {
            const c = readHex(e.target.value)
            if (c) setHex(c, e.target.value)
            else setText(e.target.value)
          }}
          onBlur={() => setText(hex)}
        />
      </label>
      {clash && <p className={styles.sheetNote}>That color is already in the strip.</p>}
      <p className={playStyles.sheetHead}>Used most in campaigns</p>
      <div className={styles.quick}>
        {QUICK_PICKS.map(c => (
          <button
            key={c}
            type="button"
            aria-label={c}
            title={c}
            aria-pressed={c === hex}
            style={{ '--c': c } as CSSProperties}
            onClick={() => setHex(c)}
          />
        ))}
      </div>
      {target === null ? (
        <button
          type="button"
          data-size="compact"
          data-variant="blue"
          disabled={clash}
          onClick={() => {
            commit(addColor(getDraft(), hex))
            onChoose(hex)
            close(false)
          }}
        >
          Add
        </button>
      ) : (
        <div className={playStyles.railFolds}>
          <button
            type="button"
            data-size="compact"
            onClick={() => {
              revert()
              finish.current()
              commit(removeColor(getDraft(), target))
              onClose()
            }}
          >
            Remove
          </button>
          <button type="button" data-size="compact" data-variant="blue" onClick={() => close(true)}>
            Done
          </button>
        </div>
      )}
    </div>
  )
}
