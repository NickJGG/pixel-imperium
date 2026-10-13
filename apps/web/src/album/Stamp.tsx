import type { CSSProperties, ReactNode } from 'react'
import type { Campaign, StampId } from '@pixel-imperium/protocol'
import { MONTH_NAMES } from '../daily/month.ts'
import { BoltIcon, CheckIcon, CrownIcon, FlameIcon, PageStarIcon, SparkleIcon, StickerIcon } from './icons.tsx'
import { paperFor, paperStyle, seasonOf } from './paper.ts'
import styles from './Stamp.module.css'

export interface StampDef {
  id: StampId
  label: string
  icon: ReactNode
  tone: 'pink' | 'foil' | 'tab' | 'gold'
  style?: CSSProperties
}

/** How Stamp `id` looks; a `conquered:` one takes its province's name and paper from `campaign`. */
export function stampDef(id: StampId, campaign?: Campaign): StampDef {
  switch (id) {
    case 'first-sticker':
      return { id, label: 'First sticker', icon: <StickerIcon />, tone: 'pink' }
    case 'first-foil':
      return { id, label: 'First foil', icon: <SparkleIcon />, tone: 'foil' }
    case 'foil-run':
      return { id, label: '5 foil in a row', icon: <FlameIcon />, tone: 'foil' }
    case 'spree':
      return { id, label: '10 in a day', icon: <BoltIcon />, tone: 'pink' }
    case 'perfect-page':
      return { id, label: 'Perfect page', icon: <PageStarIcon />, tone: 'foil' }
    case 'album-complete':
      return { id, label: 'Album complete', icon: <CrownIcon />, tone: 'gold' }
    case 'year-complete':
      return { id, label: 'Year complete', icon: <CrownIcon />, tone: 'gold' }
  }
  if (id.startsWith('month-complete:')) {
    const month = Number(id.slice('month-complete:'.length))
    return { id, label: `${MONTH_NAMES[month - 1]} complete`, icon: <CheckIcon />, tone: 'tab', style: paperFor(seasonOf(month)) }
  }
  const provinces = campaign?.provinces ?? []
  const i = provinces.findIndex(p => `conquered:${p.id}` === id)
  return {
    id,
    label: i < 0 ? 'Page conquered' : `${provinces[i]!.name.replace(/^The /, '')} conquered`,
    icon: <CheckIcon />,
    tone: 'tab',
    ...(i >= 0 && { style: paperStyle(i) }),
  }
}

interface Props {
  stamp: StampDef
  /** Dashed and waiting, not yet earned. */
  off?: boolean | undefined
  className?: string | undefined
}

/** A Stamp's round token. Size it with `--token-size`. */
export function StampToken({ stamp: { icon, tone, style }, off, className }: Props) {
  return (
    <span
      className={className ? `${styles.token} ${className}` : styles.token}
      data-tone={tone}
      data-off={off || undefined}
      style={style}
    >
      {icon}
    </span>
  )
}
