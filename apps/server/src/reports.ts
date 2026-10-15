import { existsSync } from 'node:fs'
import { createDb } from './db/index.ts'
import { listReports } from './workshop.ts'

const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

const db = createDb(process.env.DATABASE_URL)
const rows = await listReports(db)
if (rows.length === 0) console.log('No reports.')
else console.table(rows.map(r => ({ ...r, at: r.at.toISOString().slice(0, 16).replace('T', ' ') })))
await db.$client.end()
