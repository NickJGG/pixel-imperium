import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { loadSeedPuzzles } from './puzzles.ts'

const port = Number(process.env.PORT ?? 8787)
const app = createApp(loadSeedPuzzles())

serve({ fetch: app.fetch, port }, info => {
  console.log(`api listening on http://localhost:${info.port}`)
})
