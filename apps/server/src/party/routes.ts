import { Hono } from 'hono'
import { type ApiError, DEVICE_TOKEN, type PartyInfo } from '@pixel-imperium/protocol'
import type { AppEnv } from '../app.ts'
import type { PartyHub } from './server.ts'

export function partyRoutes(hub: PartyHub) {
  return new Hono<AppEnv>().get('/party/:code', async c => {
    const user = c.get('user')
    const device = c.req.query('device')
    const info = await hub.info(
      c.req.param('code'),
      { userId: user?.id ?? null, started: c.req.query('started') === '1' },
      user?.handle ?? null,
      device && DEVICE_TOKEN.test(device) ? device : null,
    )
    if (!info) return c.json<ApiError>({ error: `no party '${c.req.param('code')}'` }, 404)
    return c.json<PartyInfo>(info)
  })
}
