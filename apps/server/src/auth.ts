import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { sql } from 'drizzle-orm'
import type { Db } from './db/index.ts'
import * as schema from './db/schema.ts'
import { provisionalHandle } from './handles.ts'

export interface AuthEnv {
  secret: string
  baseURL: string
  google?: { clientId: string; clientSecret: string }
  discord?: { clientId: string; clientSecret: string }
}

export function createAuth(db: Db, env: AuthEnv) {
  const handleTaken = async (handle: string) =>
    (await db.$count(schema.user, sql`lower(${schema.user.handle}) = ${handle.toLowerCase()}`)) > 0

  return betterAuth({
    secret: env.secret,
    baseURL: env.baseURL,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    socialProviders: {
      ...(env.google && { google: env.google }),
      ...(env.discord && { discord: env.discord }),
    },
    account: {
      // Linking from settings is an explicit, signed-in action, so the providers' emails may differ.
      accountLinking: { enabled: true, trustedProviders: ['google', 'discord'], allowDifferentEmails: true },
    },
    user: {
      additionalFields: {
        // Not required at the API layer: the create hook below always fills it.
        handle: { type: 'string', required: false, input: false },
        handleConfirmed: { type: 'boolean', required: false, input: false, defaultValue: false },
      },
      deleteUser: { enabled: true },
    },
    databaseHooks: {
      user: {
        create: {
          before: async user => ({ data: { ...user, handle: await provisionalHandle(user.name, handleTaken) } }),
        },
      },
    },
  })
}

export type Auth = ReturnType<typeof createAuth>

/** Social providers whose client id and secret are both set in the environment. */
export function authEnvFromProcess(): AuthEnv {
  const provider = (prefix: string) => {
    const clientId = process.env[`${prefix}_CLIENT_ID`]
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`]
    return clientId && clientSecret ? { clientId, clientSecret } : undefined
  }
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not set')
  const google = provider('GOOGLE')
  const discord = provider('DISCORD')
  return {
    secret,
    baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
    ...(google && { google }),
    ...(discord && { discord }),
  }
}
