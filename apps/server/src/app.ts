import { Hono } from 'hono'
import { satisfiesClues } from '@pixel-imperium/nonogram'
import type { ApiError, PuzzleClues, PuzzleSummary, SolveResponse } from '@pixel-imperium/protocol'
import type { Puzzle } from './puzzles.ts'

export function createApp(puzzles: readonly Puzzle[]) {
  const byId = new Map(puzzles.map(p => [p.id, p]))
  const notFound = (id: string): ApiError => ({ error: `no puzzle '${id}'` })

  return new Hono()
    .basePath('/api')
    .get('/puzzles', c =>
      c.json(
        puzzles.map(
          ({ id, title, width, height, filledCount }): PuzzleSummary => ({ id, title, width, height, filledCount }),
        ),
      ),
    )
    .get('/puzzles/:id', c => {
      const p = byId.get(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)
      const { id, title, width, height, filledCount, clues } = p
      return c.json<PuzzleClues>({ id, title, width, height, filledCount, clues })
    })
    .post('/puzzles/:id/solve', async c => {
      const p = byId.get(c.req.param('id'))
      if (!p) return c.json(notFound(c.req.param('id')), 404)

      const body: unknown = await c.req.json().catch(() => null)
      const cells = (body as { cells?: unknown } | null)?.cells
      if (
        !Array.isArray(cells) ||
        cells.length !== p.width * p.height ||
        !cells.every(cell => cell === 'filled' || cell === 'empty')
      ) {
        return c.json<ApiError>({ error: `cells must be ${p.width * p.height} of 'filled' | 'empty'` }, 400)
      }

      const solved = satisfiesClues({ width: p.width, height: p.height, cells }, p.clues)
      return c.json<SolveResponse>(solved ? { solved: true, palette: p.palette } : { solved: false })
    })
}
