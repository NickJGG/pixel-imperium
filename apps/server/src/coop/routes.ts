import { Hono } from 'hono'
import { type ApiError, type CoopRoomInfo, type CreateCoopResponse, DEVICE_TOKEN } from '@pixel-imperium/protocol'
import type { AppEnv } from '../app.ts'
import { rateLimiter } from '../rate-limit.ts'
import type { CoopRooms } from './server.ts'

export function coopRoutes(rooms: CoopRooms) {
  const createAllowed = rateLimiter(30, 60 * 60_000)

  return new Hono<AppEnv>()
    .post('/coop', async c => {
      const user = c.get('user')
      if (!user) return c.json<ApiError>({ error: 'hosting a co-op needs an account' }, 401)
      const body = (await c.req.json().catch(() => null)) as { puzzleId?: unknown } | null
      if (typeof body?.puzzleId !== 'string') return c.json<ApiError>({ error: 'puzzleId must be a string' }, 400)
      if (!createAllowed(user.id)) return c.json<ApiError>({ error: 'too many co-ops; try again later' }, 429)
      const created = await rooms.create({ id: user.id, handle: user.handle ?? user.name }, body.puzzleId)
      if ('status' in created) return c.json(created.error, created.status)
      return c.json<CreateCoopResponse>(created, 201)
    })
    .get('/coop/:code', async c => {
      const user = c.get('user')
      const device = c.req.query('device')
      const info = await rooms.info(
        c.req.param('code'),
        { userId: user?.id ?? null, started: c.req.query('started') === '1' },
        user?.handle ?? null,
        device && DEVICE_TOKEN.test(device) ? device : null,
      )
      if (!info) return c.json<ApiError>({ error: `no co-op '${c.req.param('code')}'` }, 404)
      return c.json<CoopRoomInfo>(info)
    })
}
