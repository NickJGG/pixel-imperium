import { existsSync } from 'node:fs'
import type { Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { createApi } from './app.ts'
import { authEnvFromProcess, createAuth } from './auth.ts'
import { loadCampaigns } from './campaigns.ts'
import { createCatalog } from './catalog.ts'
import { CoopRooms } from './coop/server.ts'
import { loadDailies } from './dailies.ts'
import { createDb } from './db/index.ts'

const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is not set')
const db = createDb(databaseUrl)

const production = process.env.NODE_ENV === 'production'
const port = Number(process.env.PORT ?? 8787)
const auth = createAuth(db, authEnvFromProcess())
const catalog = createCatalog(loadCampaigns({ includeDrafts: !production }), { db }, loadDailies())
const coop = new CoopRooms({ db, auth, catalog })
const restored = await coop.restore()
if (restored > 0) console.log(`restored ${restored} co-op${restored === 1 ? '' : 's'}`)
const api = createApi(catalog, { db, auth, coop })

/** In production one origin serves the built SPA beside the API; in dev Vite serves it and proxies /api and /ws. */
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
coop.attach(server as Server)

const shutdown = async () => {
  await coop.shutdown().catch(e => console.error('saving co-ops failed', e))
  server.close(async () => {
    await db.$client.end({ timeout: 5 })
    process.exit(0)
  })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
