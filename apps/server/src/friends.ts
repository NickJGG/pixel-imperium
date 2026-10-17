/** Friends: requests, accepting, declining, cancelling, removing, and how a viewer stands with a Profile's owner. */
import { Hono } from 'hono'
import type {
  ApiError,
  Friend,
  FriendRequestOutcome,
  FriendRequestResponse,
  Friends,
  Friendship,
} from '@pixel-imperium/protocol'
import { and, asc, desc, eq, or, sql } from 'drizzle-orm'
import type { AppEnv } from './app.ts'
import type { Db } from './db/index.ts'
import { friendRequest, friendship, user } from './db/schema.ts'
import { handleIs } from './handles.ts'
import { rateLimiter } from './rate-limit.ts'

const pairOf = (x: string, y: string) => (x < y ? { userA: x, userB: y } : { userA: y, userB: x })

const pairIs = (x: string, y: string) => {
  const { userA, userB } = pairOf(x, y)
  return and(eq(friendship.userA, userA), eq(friendship.userB, userB))
}

const requestIs = (fromId: string, toId: string) => and(eq(friendRequest.fromId, fromId), eq(friendRequest.toId, toId))

const person = { handle: user.handle, name: user.name, image: user.image }

/** The live side of Friends, kept by the Party hub. */
export interface FriendsHub {
  presenceOf(userId: string): { online: boolean; party: number | null }
  /** A request just reached `toId` from the player with Handle `from`. */
  friendRequested(toId: string, from: string): void
  /** These players' friendships changed. */
  friendsChanged(...userIds: string[]): Promise<void>
}

const OUTCOME_STATUS = { sent: 201, accepted: 200, 'not-found': 404, self: 400, already: 409 } as const

export async function friendshipOf(db: Db, viewerId: string, ownerId: string): Promise<Friendship> {
  if (viewerId === ownerId) return 'self'
  const [friends, requests] = await Promise.all([
    db.$count(friendship, pairIs(viewerId, ownerId)),
    db
      .select({ fromId: friendRequest.fromId })
      .from(friendRequest)
      .where(or(requestIs(viewerId, ownerId), requestIs(ownerId, viewerId))),
  ])
  if (friends > 0) return 'friends'
  const [request] = requests
  return !request ? 'none' : request.fromId === viewerId ? 'sent' : 'received'
}

export function friendsRoutes({ db, hub }: { db: Db; hub: FriendsHub }) {
  const requestAllowed = rateLimiter(30, 60 * 60_000)

  const idOf = async (handle: string) => {
    const [row] = await db.select({ id: user.id }).from(user).where(handleIs(handle))
    return row?.id ?? null
  }

  const noPlayer = (handle: string): ApiError => ({ error: `no player '${handle}'` })

  return new Hono<AppEnv>()
    .get('/me/friends', async c => {
      const me = c.get('user')!.id
      const other = sql`case when ${friendship.userA} = ${me} then ${friendship.userB} else ${friendship.userA} end`
      const [people, incoming, outgoing] = await Promise.all([
        db
          .select({ id: user.id, ...person })
          .from(friendship)
          .innerJoin(user, eq(user.id, other))
          .where(or(eq(friendship.userA, me), eq(friendship.userB, me)))
          .orderBy(asc(sql`lower(${user.handle})`)),
        db
          .select(person)
          .from(friendRequest)
          .innerJoin(user, eq(user.id, friendRequest.fromId))
          .where(eq(friendRequest.toId, me))
          .orderBy(desc(friendRequest.createdAt)),
        db
          .select(person)
          .from(friendRequest)
          .innerJoin(user, eq(user.id, friendRequest.toId))
          .where(eq(friendRequest.fromId, me))
          .orderBy(desc(friendRequest.createdAt)),
      ])
      // Sorting is stable, so each half keeps its Handle order.
      const friends = people
        .map(({ id, ...p }): Friend => ({ ...p, ...hub.presenceOf(id) }))
        .sort((a, b) => Number(b.online) - Number(a.online))
      return c.json<Friends>({ friends, incoming, outgoing })
    })
    .post('/me/friends/requests', async c => {
      const me = c.get('user')!.id
      const body = (await c.req.json().catch(() => null)) as { handle?: unknown } | null
      if (typeof body?.handle !== 'string') return c.json<ApiError>({ error: 'handle must be a string' }, 400)
      if (!requestAllowed(me)) return c.json<ApiError>({ error: 'too many friend requests; try again later' }, 429)

      const them = await idOf(body.handle)
      const outcome = await (async (): Promise<FriendRequestOutcome> => {
        if (!them) return 'not-found'
        const state = await friendshipOf(db, me, them)
        if (state === 'self') return 'self'
        if (state === 'friends' || state === 'sent') return 'already'
        if (state === 'received') {
          await db.transaction(async tx => {
            await tx.delete(friendRequest).where(requestIs(them, me))
            await tx.insert(friendship).values(pairOf(me, them)).onConflictDoNothing()
          })
          await hub.friendsChanged(me, them)
          return 'accepted'
        }
        await db.insert(friendRequest).values({ fromId: me, toId: them }).onConflictDoNothing()
        hub.friendRequested(them, c.get('user')!.handle ?? c.get('user')!.name)
        return 'sent'
      })()
      return c.json<FriendRequestResponse>({ outcome }, OUTCOME_STATUS[outcome])
    })
    .post('/me/friends/requests/:handle/accept', async c => {
      const me = c.get('user')!.id
      const them = await idOf(c.req.param('handle'))
      if (!them) return c.json(noPlayer(c.req.param('handle')), 404)
      const accepted = await db.transaction(async tx => {
        const gone = await tx.delete(friendRequest).where(requestIs(them, me)).returning()
        if (gone.length === 0) return false
        await tx.insert(friendship).values(pairOf(me, them)).onConflictDoNothing()
        return true
      })
      if (!accepted) return c.json<ApiError>({ error: 'no friend request from them' }, 404)
      await hub.friendsChanged(me, them)
      return c.body(null, 204)
    })
    .post('/me/friends/requests/:handle/decline', async c => {
      const me = c.get('user')!.id
      const them = await idOf(c.req.param('handle'))
      if (!them) return c.json(noPlayer(c.req.param('handle')), 404)
      const gone = await db.delete(friendRequest).where(requestIs(them, me)).returning()
      if (gone.length === 0) return c.json<ApiError>({ error: 'no friend request from them' }, 404)
      return c.body(null, 204)
    })
    .delete('/me/friends/requests/:handle', async c => {
      const me = c.get('user')!.id
      const them = await idOf(c.req.param('handle'))
      if (!them) return c.json(noPlayer(c.req.param('handle')), 404)
      const gone = await db.delete(friendRequest).where(requestIs(me, them)).returning()
      if (gone.length === 0) return c.json<ApiError>({ error: 'no friend request to them' }, 404)
      return c.body(null, 204)
    })
    .delete('/me/friends/:handle', async c => {
      const me = c.get('user')!.id
      const them = await idOf(c.req.param('handle'))
      if (!them) return c.json(noPlayer(c.req.param('handle')), 404)
      const gone = await db.delete(friendship).where(pairIs(me, them)).returning()
      if (gone.length === 0) return c.json<ApiError>({ error: 'not friends' }, 404)
      await hub.friendsChanged(me, them)
      return c.body(null, 204)
    })
}
