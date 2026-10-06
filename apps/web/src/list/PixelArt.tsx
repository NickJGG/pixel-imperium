import { type CSSProperties, useEffect, useRef } from 'react'
import styles from './PuzzleList.module.css'

interface Props {
  title: string
  width: number
  height: number
  palette: readonly (string | null)[]
}

/** A solved puzzle's picture at one canvas pixel per cell; CSS scales it up unsmoothed. */
export function PixelArt({ title, width, height, palette }: Props) {
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
      className={`${styles.box} ${styles.art}`}
      style={{ '--w': width, '--h': height } as CSSProperties}
      role="img"
      aria-label={`${title}, solved`}
    />
  )
}
