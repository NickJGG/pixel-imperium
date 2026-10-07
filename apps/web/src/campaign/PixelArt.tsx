import { type CSSProperties, useEffect, useRef } from 'react'
import styles from './Campaign.module.css'

interface Props {
  title: string
  width: number
  height: number
  palette: readonly (string | null)[]
  className?: string | undefined
}

/** A solved puzzle's picture at one canvas pixel per cell; CSS scales it up unsmoothed. */
export function PixelArt({ title, width, height, palette, className = `${styles.box} ${styles.art}` }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = ref.current!.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, width, height)
    palette.forEach((color, i) => {
      if (color === null) return
      ctx.fillStyle = color
      ctx.fillRect(i % width, Math.floor(i / width), 1, 1)
    })
  }, [width, height, palette])

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={className}
      style={{ '--w': width, '--h': height } as CSSProperties}
      role="img"
      aria-label={`${title}, solved`}
    />
  )
}
