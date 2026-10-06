import { existsSync } from 'node:fs'
import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { authEnvFromProcess, createAuth } from './auth.ts'
import { createDb } from './db/index.ts'
import { loadSeedPuzzles } from './puzzles.ts'

const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set')
const db = createDb(databaseUrl)

const port = Number(process.env.PORT ?? 8787)
const app = createApp(loadSeedPuzzles(), { db, auth: createAuth(db, authEnvFromProcess()) })

serve({ fetch: app.fetch, port }, info => {
  console.log(`api listening on http://localhost:${info.port}`)
})
