/**
 * Better Auth's tables (`user`, `session`, `account`, `verification`) mirror what its Drizzle schema
 * generator emits for our config; keep them in step when changing `auth.ts` options.
 * Puzzle ids reference the campaign files in `data/campaigns/`, so they carry no foreign key.
 */
import type { Assists } from '@pixel-imperium/protocol'
import { sql } from 'drizzle-orm'
import { boolean, index, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const user = pgTable(
  'user',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    email: text('email').notNull().unique(),
    emailVerified: boolean('email_verified').default(false).notNull(),
    image: text('image'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    handle: text('handle').notNull(),
    /** False until the player accepts or changes the provisional handle given at sign-up. */
    handleConfirmed: boolean('handle_confirmed').default(false).notNull(),
  },
  t => [uniqueIndex('user_handle_lower_idx').on(sql`lower(${t.handle})`)],
)

export const session = pgTable(
  'session',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at').notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
  },
  t => [index('session_userId_idx').on(t.userId)],
)

export const account = pgTable(
  'account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at'),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .$onUpdate(() => new Date())
      .notNull(),
  },
  t => [index('account_userId_idx').on(t.userId)],
)

export const verification = pgTable(
  'verification',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  t => [index('verification_identifier_idx').on(t.identifier)],
)

export const solve = pgTable(
  'solve',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    puzzleId: text('puzzle_id').notNull(),
    verified: boolean('verified').notNull(),
    solvedAt: timestamp('solved_at').defaultNow().notNull(),
  },
  t => [primaryKey({ columns: [t.userId, t.puzzleId] })],
)

export const progress = pgTable(
  'progress',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    puzzleId: text('puzzle_id').notNull(),
    /** Row-major `.#x` (empty, filled, marked), as in the web app's `progress-storage.ts`. */
    cells: text('cells').notNull(),
    replaying: boolean('replaying').default(false).notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  t => [primaryKey({ columns: [t.userId, t.puzzleId] })],
)

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  assists: jsonb('assists').$type<Assists>().notNull(),
})
