import { type CSSProperties, useMemo } from 'react'

interface Props {
  title: string
  width: number
  height: number
  palette: readonly (string | null)[]
  className?: string | undefined
}

/**
 * A picture drawn one pixel per cell, as a data URL. An image rather than a live canvas, since Firefox leaves
 * canvases blank in a view transition's snapshot of the page being left.
 */
export function pixelImage(width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (ctx) draw(ctx)
  return canvas.toDataURL()
}

/** A solved puzzle's picture at one image pixel per cell; CSS scales it up unsmoothed. */
export function PixelArt({ title, width, height, palette, className }: Props) {
  const src = useMemo(
    () =>
      pixelImage(width, height, ctx =>
        palette.forEach((color, i) => {
          if (color === null) return
          ctx.fillStyle = color
          ctx.fillRect(i % width, Math.floor(i / width), 1, 1)
        }),
      ),
    [width, height, palette],
  )

  return (
    <img
      src={src}
      width={width}
      height={height}
      className={className}
      style={{ '--w': width, '--h': height } as CSSProperties}
      alt={`${title}, solved`}
    />
  )
}
