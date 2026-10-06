import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

const client = createAuthClient({
  plugins: [inferAdditionalFields({ user: { handle: { type: 'string', required: true } } })],
})

export const { useSession, getSession, signIn, signOut } = client

export type Provider = 'google' | 'discord'
