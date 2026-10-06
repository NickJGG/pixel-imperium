import { createAuthClient } from 'better-auth/react'
import { inferAdditionalFields } from 'better-auth/client/plugins'

const client = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        handle: { type: 'string', required: true },
        handleConfirmed: { type: 'boolean', required: true },
      },
    }),
  ],
})

export const { useSession, getSession, signIn, signOut, linkSocial, listAccounts, unlinkAccount, deleteUser } = client

/** Refetches `useSession` after a change Better Auth didn't make itself, such as a handle rename. */
export const refreshSession = () => client.$store.notify('$sessionSignal')

export type Provider = 'google' | 'discord'

export const PROVIDERS: { id: Provider; label: string }[] = [
  { id: 'google', label: 'Google' },
  { id: 'discord', label: 'Discord' },
]
