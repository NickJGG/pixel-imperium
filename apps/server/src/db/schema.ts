/**
 * Better Auth's tables (`user`, `session`, `account`, `verification`) mirror what its Drizzle schema
 * generator emits for our config; keep them in step when changing `auth.ts` options.
 * Puzzle ids reference the campaign files in `data/campaigns/` or a `made_puzzle` row, so they carry no foreign key.
 */
import type { Assists, CrestDraft, DraftCampaignDoc, MadeProvince, SeedPuzzle } from '@pixel-imperium/protocol'
import { sql } from 'drizzle-orm'
import type { SavedGrid } from '../party/grid.ts'
import type { Identity, SavedSeat } from '../party/party.ts'
import { boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

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
    /** Up to three verified puzzle ids, biggest sticker first; app data, so not in `auth.ts`. */
    showcase: text('showcase').array().default(sql`'{}'::text[]`).notNull(),
    /** When the player was first offered the Tutorial, on any device. */
    tutorialAskedAt: timestamp('tutorial_asked_at'),
    /** When the player was first offered the Techniques, on any device. */
    techniquesAskedAt: timestamp('techniques_asked_at'),
    /** Set by `pnpm takedown --ban`; the Author can no longer publish. */
    publishBannedAt: timestamp('publish_banned_at'),
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
    /** Decided when the row is first inserted, from whether a hint came first; never changed after. */
    foil: boolean('foil').default(false).notNull(),
    solvedAt: timestamp('solved_at').defaultNow().notNull(),
    /** The fastest unhinted Solve time in ms, trusted from the client; only ever lowered. */
    bestMs: integer('best_ms'),
  },
  t => [primaryKey({ columns: [t.userId, t.puzzleId] })],
)

/** A hint given to the player on the puzzle, before or after solving it. */
export const hint = pgTable(
  'hint',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    puzzleId: text('puzzle_id').notNull(),
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
    /** Active time on the current Attempt. */
    elapsedMs: integer('elapsed_ms').default(0).notNull(),
    attemptHinted: boolean('attempt_hinted').default(false).notNull(),
  },
  t => [primaryKey({ columns: [t.userId, t.puzzleId] })],
)

export const userSettings = pgTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  assists: jsonb('assists').$type<Assists>().notNull(),
})

/** A finished Lesson, keyed `<track>:<lesson>` as in the web app's `tutorial/done.ts`. */
export const lessonDone = pgTable(
  'lesson_done',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    lesson: text('lesson').notNull(),
    doneAt: timestamp('done_at').defaultNow().notNull(),
  },
  t => [primaryKey({ columns: [t.userId, t.lesson] })],
)

/** A Workshop puzzle not yet published; the id is the client's, unique per Account. */
export const draftPuzzle = pgTable(
  'draft_puzzle',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    title: text('title').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    /** Row-major hex colors, `null` for empty cells. */
    cells: jsonb('cells').$type<(string | null)[]>().notNull(),
    /** The color strip's order. */
    colors: jsonb('colors').$type<string[]>().notNull(),
    paper: text('paper'),
    updatedAt: timestamp('updated_at').notNull(),
  },
  t => [primaryKey({ columns: [t.userId, t.id] })],
)

/** A Workshop campaign not yet published; the id is the client's, unique per Account. */
export const draftCampaign = pgTable(
  'draft_campaign',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    id: text('id').notNull(),
    doc: jsonb('doc').$type<DraftCampaignDoc>().notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  t => [primaryKey({ columns: [t.userId, t.id] })],
)

/** A published player-made puzzle. Its picture is final; only the title and paper change. */
export const madePuzzle = pgTable(
  'made_puzzle',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** `seed.title` is left stale; `title` is the current one. */
    seed: jsonb('seed').$type<SeedPuzzle>().notNull(),
    paper: text('paper'),
    /** Line-logic sweeps to solve, from the publish check. */
    passes: integer('passes').notNull(),
    campaignId: text('campaign_id'),
    /** The draft it was published from, so a campaign draft still naming that draft finds it. */
    draftId: text('draft_id'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    retiredAt: timestamp('retired_at'),
    /** Taken down by an admin: gone for everyone. */
    removedAt: timestamp('removed_at'),
  },
  t => [index('made_puzzle_author_idx').on(t.authorId), index('made_puzzle_campaign_idx').on(t.campaignId)],
)

/** A published player-made campaign. Its structure is final; titles, names, flavour and papers change. */
export const madeCampaign = pgTable(
  'made_campaign',
  {
    id: text('id').primaryKey(),
    authorId: text('author_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    paper: text('paper').notNull(),
    provinces: jsonb('provinces').$type<MadeProvince[]>().notNull(),
    crest: jsonb('crest').$type<CrestDraft>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    retiredAt: timestamp('retired_at'),
    removedAt: timestamp('removed_at'),
  },
  t => [index('made_campaign_author_idx').on(t.authorId)],
)

/** A player's report of a player-made puzzle or campaign, from an Account or, signed out, an IP. */
export const report = pgTable('report', {
  id: serial('id').primaryKey(),
  targetId: text('target_id').notNull(),
  reason: text('reason').notNull(),
  reporterId: text('reporter_id').references(() => user.id, { onDelete: 'set null' }),
  reporterIp: text('reporter_ip'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

/** Parties saved over a restart: written on shutdown, read back and deleted on boot. */
export const party = pgTable('party', {
  code: text('code').primaryKey(),
  previousCodes: text('previous_codes').array().notNull(),
  hostId: text('host_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' }),
  hostSeat: integer('host_seat').notNull(),
  seats: jsonb('seats').$type<(SavedSeat | null)[]>().notNull(),
  removed: jsonb('removed').$type<Identity[]>().notNull(),
  grid: jsonb('grid').$type<SavedGrid>(),
  savedAt: timestamp('saved_at').defaultNow().notNull(),
})

/** A mutual Friend pair, stored once with `userA < userB`. */
export const friendship = pgTable(
  'friendship',
  {
    userA: text('user_a')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    userB: text('user_b')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  t => [primaryKey({ columns: [t.userA, t.userB] }), index('friendship_user_b_idx').on(t.userB)],
)

/** A friend request waiting on `toId`'s answer. */
export const friendRequest = pgTable(
  'friend_request',
  {
    fromId: text('from_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    toId: text('to_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  t => [primaryKey({ columns: [t.fromId, t.toId] }), index('friend_request_to_idx').on(t.toId)],
)
