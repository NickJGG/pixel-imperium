import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { makeSignature } from 'better-auth/crypto'
import { type Auth, createAuth } from './auth.ts'
import { type Db, MIGRATIONS_FOLDER, createDb } from './db/index.ts'
import { session, user } from './db/schema.ts'

const envFile = new URL('../../../.env', import.meta.url)
if (existsSync(envFile)) process.loadEnvFile(envFile)

/** A migrated test database (`DATABASE_URL_TEST`) and an auth instance over it. */
export async function createTestDeps(): Promise<{ db: Db; auth: Auth }> {
  const url = process.env.DATABASE_URL_TEST
  if (!url) throw new Error('DATABASE_URL_TEST is not set; see .env.example and `docker compose up -d`')
  const db = createDb(url)
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER })
  return { db, auth: createAuth(db, { secret: 'test-secret-at-least-32-characters-long', baseURL: 'http://localhost' }) }
}

export async function truncateAll(db: Db) {
  await db.execute(sql`TRUNCATE "user", verification CASCADE`)
}

/** Inserts a user and a live session directly, returning the signed session cookie to send. */
export async function signedInUser(db: Db, auth: Auth, handle = 'tester') {
  const id = randomUUID()
  const token = randomUUID()
  await db.insert(user).values({ id, name: handle, email: `${handle}@example.com`, handle })
  await db.insert(session).values({
    id: randomUUID(),
    token,
    userId: id,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    updatedAt: new Date(),
  })
  const ctx = await auth.$context
  const signed = `${token}.${await makeSignature(token, ctx.secret)}`
  return { id, cookie: `${ctx.authCookies.sessionToken.name}=${encodeURIComponent(signed)}` }
}
