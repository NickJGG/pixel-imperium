import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { FriendRequestResponse, Friends, Friendship, Profile } from '@pixel-imperium/protocol'
import { eq } from 'drizzle-orm'
import { createApp } from './app.ts'
import { user } from './db/schema.ts'
import { createTestDeps, signedInUser, truncateAll } from './test-db.ts'

const { db, auth } = await createTestDeps()
const app = createApp([], { db, auth })

beforeEach(() => truncateAll(db))
afterAll(() => db.$client.end())

function call(method: string, path: string, cookie?: string, body?: unknown) {
  return app.request(`/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  })
}

async function request(cookie: string, handle: string) {
  const res = await call('POST', '/me/friends/requests', cookie, { handle })
  return { status: res.status, outcome: ((await res.json()) as FriendRequestResponse).outcome }
}

async function friendsOf(cookie: string) {
  const res = await call('GET', '/me/friends', cookie)
  expect(res.status).toBe(200)
  return (await res.json()) as Friends
}

const handles = (people: Friends['friends']) => people.map(p => p.handle)

async function standing(viewer: string | undefined, handle: string): Promise<Friendship | null> {
  return ((await (await call('GET', `/users/${handle}`, viewer)).json()) as Profile).friendship
}

describe('friends', () => {
  it('needs an account', async () => {
    expect((await call('GET', '/me/friends')).status).toBe(401)
    expect((await call('POST', '/me/friends/requests', undefined, { handle: 'juno' })).status).toBe(401)
  })

  it('becomes friends once the request is accepted', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    const juno = await signedInUser(db, auth, 'juno')
    expect(await request(nick.cookie, 'JUNO')).toEqual({ status: 201, outcome: 'sent' })

    expect(await friendsOf(nick.cookie)).toMatchObject({ friends: [], incoming: [], outgoing: [{ handle: 'juno' }] })
    expect(await friendsOf(juno.cookie)).toEqual({
      friends: [],
      incoming: [{ handle: 'nick', name: 'nick', image: null }],
      outgoing: [],
    })

    expect((await call('POST', '/me/friends/requests/nick/accept', juno.cookie)).status).toBe(204)
    expect(await friendsOf(nick.cookie)).toEqual({
      friends: [{ handle: 'juno', name: 'juno', image: null }],
      incoming: [],
      outgoing: [],
    })
    expect(handles((await friendsOf(juno.cookie)).friends)).toEqual(['nick'])
  })

  it('accepts at once when they had already asked', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    const juno = await signedInUser(db, auth, 'juno')
    await request(juno.cookie, 'nick')
    expect(await request(nick.cookie, 'juno')).toEqual({ status: 200, outcome: 'accepted' })
    expect(await friendsOf(nick.cookie)).toMatchObject({ friends: [{ handle: 'juno' }], incoming: [], outgoing: [] })
    expect(await friendsOf(juno.cookie)).toMatchObject({ friends: [{ handle: 'nick' }], incoming: [], outgoing: [] })
  })

  it('says already for a repeat request or an existing friend', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    const juno = await signedInUser(db, auth, 'juno')
    await request(nick.cookie, 'juno')
    expect(await request(nick.cookie, 'juno')).toEqual({ status: 409, outcome: 'already' })
    await call('POST', '/me/friends/requests/nick/accept', juno.cookie)
    expect(await request(nick.cookie, 'juno')).toEqual({ status: 409, outcome: 'already' })
    expect(await request(juno.cookie, 'nick')).toEqual({ status: 409, outcome: 'already' })
  })

  it('drops a declined request without making friends', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    const juno = await signedInUser(db, auth, 'juno')
    await request(nick.cookie, 'juno')
    expect((await call('POST', '/me/friends/requests/nick/decline', juno.cookie)).status).toBe(204)
    expect(await friendsOf(nick.cookie)).toEqual({ friends: [], incoming: [], outgoing: [] })
    expect(await friendsOf(juno.cookie)).toEqual({ friends: [], incoming: [], outgoing: [] })
    expect((await call('POST', '/me/friends/requests/nick/accept', juno.cookie)).status).toBe(404)
  })

  it('lets the sender cancel, and only the sender', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    const juno = await signedInUser(db, auth, 'juno')
    await request(nick.cookie, 'juno')
    expect((await call('DELETE', '/me/friends/requests/nick', juno.cookie)).status).toBe(404)
    expect((await call('DELETE', '/me/friends/requests/juno', nick.cookie)).status).toBe(204)
    expect((await friendsOf(juno.cookie)).incoming).toEqual([])
  })

  it('removes a friend for both sides', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    const juno = await signedInUser(db, auth, 'juno')
    await request(nick.cookie, 'juno')
    await request(juno.cookie, 'nick')
    expect((await call('DELETE', '/me/friends/nick', juno.cookie)).status).toBe(204)
    expect((await friendsOf(nick.cookie)).friends).toEqual([])
    expect((await friendsOf(juno.cookie)).friends).toEqual([])
    expect((await call('DELETE', '/me/friends/nick', juno.cookie)).status).toBe(404)
  })

  it('refuses an unknown handle and oneself', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    expect(await request(nick.cookie, 'nobody')).toEqual({ status: 404, outcome: 'not-found' })
    expect(await request(nick.cookie, 'Nick')).toEqual({ status: 400, outcome: 'self' })
    expect((await call('POST', '/me/friends/requests', nick.cookie, { handle: 7 })).status).toBe(400)
    expect((await call('POST', '/me/friends/requests/nobody/accept', nick.cookie)).status).toBe(404)
  })

  it('orders friends by handle', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    for (const handle of ['zed', 'Amy', 'mo']) {
      const other = await signedInUser(db, auth, handle)
      await request(other.cookie, 'nick')
      await request(nick.cookie, handle)
    }
    expect(handles((await friendsOf(nick.cookie)).friends)).toEqual(['Amy', 'mo', 'zed'])
  })

  it('forgets friends and requests with a deleted account', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    const juno = await signedInUser(db, auth, 'juno')
    const mo = await signedInUser(db, auth, 'mo')
    await request(nick.cookie, 'juno')
    await request(juno.cookie, 'nick')
    await request(mo.cookie, 'nick')
    await db.delete(user).where(eq(user.id, juno.id))
    await db.delete(user).where(eq(user.id, mo.id))
    expect(await friendsOf(nick.cookie)).toEqual({ friends: [], incoming: [], outgoing: [] })
  })

  it('limits friend requests per hour', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    for (let i = 0; i < 30; i++) expect((await request(nick.cookie, 'nobody')).outcome).toBe('not-found')
    expect((await call('POST', '/me/friends/requests', nick.cookie, { handle: 'nobody' })).status).toBe(429)
  })
})

describe('Profile friendship', () => {
  it('is null signed out and self for the owner', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    expect(await standing(undefined, 'nick')).toBeNull()
    expect(await standing(nick.cookie, 'nick')).toBe('self')
  })

  it('walks none, sent, received and friends', async () => {
    const nick = await signedInUser(db, auth, 'nick')
    const juno = await signedInUser(db, auth, 'juno')
    expect(await standing(nick.cookie, 'juno')).toBe('none')
    await request(nick.cookie, 'juno')
    expect(await standing(nick.cookie, 'juno')).toBe('sent')
    expect(await standing(juno.cookie, 'nick')).toBe('received')
    await call('POST', '/me/friends/requests/nick/accept', juno.cookie)
    expect(await standing(nick.cookie, 'juno')).toBe('friends')
    expect(await standing(juno.cookie, 'nick')).toBe('friends')
  })
})
