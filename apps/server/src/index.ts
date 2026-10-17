import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApp } from './app.ts'
import { authEnvFromProcess, createAuth } from './auth.ts'
import { loadCampaigns } from './campaigns.ts'
import { loadDailies } from './dailies.ts'
import { createDb } from './db/index.ts'

const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set')
const db = createDb(databaseUrl)

const production = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT ?? 8787)
const campaigns = loadCampaigns({ includeDrafts: !production })
const api = createApp(campaigns, { db, auth: createAuth(db, authEnvFromProcess()) }, loadDailies())

/** In production one origin serves the built SPA beside the API; in dev Vite serves it and proxies /api. */
const WEB_DIST = fileURLToPath(new URL('../../web/dist', import.meta.url))
const app = production
  ? new Hono()
      .route('/', api)
      .all('/api/*', c => c.notFound())
      .use('*', serveStatic({ root: WEB_DIST }))
      .get('*', serveStatic({ root: WEB_DIST, path: 'index.html' }))
  : api

const server = serve({ fetch: app.fetch, port }, info => {
  console.log(`listening on http://localhost:${info.port}`)
})

const shutdown = () => {
  server.close(async () => {
    await db.$client.end({ timeout: 5 })
    process.exit(0)
  })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
