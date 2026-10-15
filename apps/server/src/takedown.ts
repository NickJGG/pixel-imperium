import { existsSync } from 'node:fs'
import { createDb } from './db/index.ts'
import { takedown } from './made.ts'

const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set')

const args = process.argv.slice(2)
const ban = args.includes('--ban')
const [id] = args.filter(a => a !== '--ban')
if (!id) {
  console.error('usage: pnpm takedown <id> [--ban]')
  process.exit(1)
}

const db = createDb(process.env.DATABASE_URL)
const done = await takedown(db, id, ban)
await db.$client.end()
if (!done) {
  console.error(`No player-made puzzle or campaign '${id}'.`)
  process.exit(1)
}
console.log(`Took down ${done.kind} '${id}'${ban ? '; its Author can no longer publish' : ''}.`)
