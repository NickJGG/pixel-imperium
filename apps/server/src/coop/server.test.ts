import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serve } from '@hono/node-server'
import { WebSocket } from 'ws'
import {
  COOP_CLOSE,
  COOP_PROTOCOL,
  type CoopClientMsg,
  type CoopRoomInfo,
  type CoopServerMsg,
  type CreateCoopResponse,
} from '@pixel-imperium/protocol'
import { and, eq } from 'drizzle-orm'
import { createApi } from '../app.ts'
import { buildCampaign } from '../campaigns.ts'
import { createCatalog } from '../catalog.ts'
import { coopRoom, madePuzzle, progress, solve } from '../db/schema.ts'
import { createTestDeps, signedInUser, truncateAll } from '../test-db.ts'
import { AUTOSAVE_MS, CoopRooms, IDLE_END_MS } from './server.ts'

const bar = { id: 'bar', title: 'Bar', palette: { g: '#0f0' }, rows: ['gg.', '...'] }
const campaign = buildCampaign({
  campaign: {
    id: 'main',
    name: 'Main',
    draft: true,
    paper: 'throne',
    closingLine: 'Done.',
    puzzlesPerProvince: 30,
    provinces: [{ id: 'one', name: 'One', theme: '', flavour: '', paper: 'coast', minSize: 5, maxSize: 5 }],
  },
  provinces: { one: [bar] },
})

const { db, auth } = await createTestDeps()
let clock = 0
const catalog = createCatalog([campaign], { db })
let coop: CoopRooms
let api: ReturnType<typeof createApi>
let server: Server
let port: number

beforeAll(async () => {
  coop = new CoopRooms({ db, auth, catalog, now: () => clock })
  api = createApi(catalog, { db, auth, coop })
  server = serve({ fetch: api.fetch, port: 0 }) as Server
  coop.attach(server)
  await new Promise(resolve => server.once('listening', resolve))
  port = (server.address() as AddressInfo).port
})
beforeEach(() => truncateAll(db))
const sockets: WebSocket[] = []
afterEach(() => {
  for (const ws of sockets.splice(0)) ws.close()
})
afterAll(async () => {
  await coop.shutdown()
  await new Promise(resolve => server.close(resolve))
  await db.$client.end()
})

async function start(cookie: string, puzzleId = 'bar') {
  const res = await api.request('/api/coop', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ puzzleId }),
  })
  return { status: res.status, body: (await res.json()) as CreateCoopResponse }
}

interface Client {
  ws: WebSocket
  messages: CoopServerMsg[]
  send(msg: CoopClientMsg): void
  next<T extends CoopServerMsg['type']>(type: T): Promise<Extract<CoopServerMsg, { type: T }>>
  closed: Promise<number>
}

/** A connected player who has sent `join`; `next` resolves with the first message of a type not yet taken. */
function connect(code: string, { cookie, device = 'device-token-0000000001' }: { cookie?: string; device?: string } = {}): Client {
  const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers: cookie ? { cookie } : {} })
  sockets.push(ws)
  const messages: CoopServerMsg[] = []
  const waiters: (() => void)[] = []
  const taken = new Set<CoopServerMsg>()
  ws.on('message', data => {
    messages.push(JSON.parse(data.toString()))
    for (const w of waiters.splice(0)) w()
  })
  const send = (msg: CoopClientMsg) => ws.send(JSON.stringify(msg))
  ws.on('open', () => send({ type: 'join', code, deviceToken: device, protocol: COOP_PROTOCOL }))
  return {
    ws,
    messages,
    send,
    next: type =>
      new Promise(resolve => {
        const check = () => {
          const found = messages.find(m => m.type === type && !taken.has(m))
          if (!found) return void waiters.push(check)
          taken.add(found)
          resolve(found as never)
        }
        check()
      }),
    closed: new Promise(resolve => ws.on('close', code => resolve(code))),
  }
}

async function until(check: () => Promise<boolean>) {
  for (let k = 0; k < 100 && !(await check()); k++) await new Promise(resolve => setTimeout(resolve, 10))
}

describe('POST /api/coop', () => {
  it('needs an account', async () => {
    expect((await start('')).status).toBe(401)
  })

  it('starts from the Host’s grid, and hands back their live co-op on the same puzzle', async () => {
    const host = await signedInUser(db, auth, 'host')
    await db.insert(progress).values({ userId: host.id, puzzleId: 'bar', cells: 'x.....', updatedAt: new Date() })
    const first = await start(host.cookie)
    expect(first.status).toBe(201)
    expect((await start(host.cookie)).body.code).toBe(first.body.code)
    const c = connect(first.body.code, { cookie: host.cookie })
    expect((await c.next('snapshot')).room).toMatchObject({ cells: 'x.....', puzzleId: 'bar', solved: false })
  })

  it('starts a solved puzzle as a Replay from empty', async () => {
    const host = await signedInUser(db, auth, 'host')
    await db.insert(solve).values({ userId: host.id, puzzleId: 'bar', verified: true })
    await db.insert(progress).values({ userId: host.id, puzzleId: 'bar', cells: '##....', updatedAt: new Date() })
    const c = connect((await start(host.cookie)).body.code, { cookie: host.cookie })
    expect((await c.next('snapshot')).room.cells).toBe('......')
  })

  it('refuses an unknown puzzle', async () => {
    const host = await signedInUser(db, auth, 'host')
    expect((await start(host.cookie, 'nope')).status).toBe(404)
  })
})

describe('GET /api/coop/:code', () => {
  it('names the host, puzzle and seats, and the guest name a device would join as', async () => {
    const host = await signedInUser(db, auth, 'host')
    const { code } = (await start(host.cookie)).body
    const res = await api.request(`/api/coop/${code}?device=device-token-0000000001`)
    expect(await res.json()).toMatchObject({
      access: 'join',
      host: 'host',
      puzzleId: 'bar',
      title: 'Bar',
      seats: [{ seat: 0, name: 'host', account: true, connected: false, cursor: null }],
      you: expect.stringMatching(/^Guest /),
    } satisfies Partial<CoopRoomInfo>)
  })

  it('is 404 for a code that never was', async () => {
    expect((await api.request('/api/coop/nothere1')).status).toBe(404)
  })
})

describe('/ws', () => {
  it('relays strokes to everyone, and on a solve records a non-foil Verified solve with no Best time', async () => {
    const host = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const { code } = (await start(host.cookie)).body
    const h = connect(code, { cookie: host.cookie })
    const a = connect(code, { cookie: ada.cookie })
    await h.next('snapshot')
    expect((await a.next('snapshot')).you).toBe(1)

    h.send({ type: 'stroke', id: 7, changes: [{ i: 0, to: '#' }] })
    expect(await a.next('stroke')).toEqual({ type: 'stroke', id: 7, by: 0, changes: [{ i: 0, to: '#' }] })
    a.send({ type: 'stroke', id: 1, changes: [{ i: 1, to: '#' }] })

    for (const c of [h, a]) {
      const solved = await c.next('solved')
      expect(solved).toMatchObject({ palette: ['#0f0', '#0f0', null, null, null, null], foil: false })
      expect(solved.stamps?.near).toBeDefined()
    }
    const rows = await db.select().from(solve).where(eq(solve.puzzleId, 'bar'))
    expect(rows.map(r => [r.userId, r.verified, r.foil, r.bestMs]).sort()).toEqual(
      [
        [host.id, true, false, null],
        [ada.id, true, false, null],
      ].sort(),
    )
  })

  it('lets a signed-out guest in under a generated name, and records nothing for them', async () => {
    const host = await signedInUser(db, auth, 'host')
    const { code } = (await start(host.cookie)).body
    const g = connect(code)
    const { room, you } = await g.next('snapshot')
    expect(room.seats.find(s => s.seat === you)).toMatchObject({ account: false, name: expect.stringMatching(/^Guest /) })
    g.send({ type: 'stroke', id: 1, changes: [{ i: 0, to: '#' }, { i: 1, to: '#' }] })
    await g.next('solved')
    expect(await db.select().from(solve).where(eq(solve.puzzleId, 'bar'))).toEqual([
      expect.objectContaining({ userId: host.id }),
    ])
  })

  it('records nothing for an Author hosting their own puzzle, but does for their guests', async () => {
    const author = await signedInUser(db, auth, 'author')
    const ada = await signedInUser(db, auth, 'ada')
    const id = 'abcde12345'
    await db.insert(madePuzzle).values({ id, authorId: author.id, title: 'Bar', seed: { ...bar, id }, passes: 1 })
    const { code } = (await start(author.cookie, id)).body
    const h = connect(code, { cookie: author.cookie })
    const a = connect(code, { cookie: ada.cookie })
    await h.next('snapshot')
    await a.next('snapshot')
    h.send({ type: 'stroke', id: 1, changes: [{ i: 0, to: '#' }, { i: 1, to: '#' }] })
    await a.next('solved')
    await h.next('solved')
    const rows = await db.select().from(solve).where(eq(solve.puzzleId, id))
    expect(rows.map(r => r.userId)).toEqual([ada.id])
  })

  it('removes a guest for good', async () => {
    const host = await signedInUser(db, auth, 'host')
    const { code } = (await start(host.cookie)).body
    const h = connect(code, { cookie: host.cookie })
    const g = connect(code)
    await h.next('snapshot')
    const { you } = await g.next('snapshot')
    h.send({ type: 'remove', seat: you })
    expect(await g.closed).toBe(COOP_CLOSE.removed)
    expect(await connect(code).closed).toBe(COOP_CLOSE.removed)
  })

  it('turns a fifth player away as full', async () => {
    const host = await signedInUser(db, auth, 'host')
    const { code } = (await start(host.cookie)).body
    await connect(code, { cookie: host.cookie }).next('snapshot')
    for (const n of [1, 2, 3]) await connect(code, { device: `device-token-000000000${n}` }).next('snapshot')
    expect(await connect(code, { device: 'device-token-0000000009' }).closed).toBe(COOP_CLOSE.full)
  })

  it('moves to a New link: the old one keeps its players but takes no one new', async () => {
    const host = await signedInUser(db, auth, 'host')
    const { code } = (await start(host.cookie)).body
    const h = connect(code, { cookie: host.cookie })
    const g = connect(code)
    await h.next('snapshot')
    await g.next('snapshot')
    h.send({ type: 'newLink' })
    const { code: fresh } = await g.next('link')
    expect(fresh).not.toBe(code)
    g.ws.close()
    expect((await connect(code).next('snapshot')).room.code).toBe(fresh)
    expect(await connect(code, { device: 'device-token-0000000009' }).closed).toBe(COOP_CLOSE.ended)
  })

  it('asks a client on another protocol to reload', async () => {
    const host = await signedInUser(db, auth, 'host')
    const { code } = (await start(host.cookie)).body
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    sockets.push(ws)
    ws.on('open', () => ws.send(JSON.stringify({ type: 'join', code, deviceToken: 'device-token-0000000001', protocol: 0 })))
    expect(await new Promise(resolve => ws.on('close', resolve))).toBe(COOP_CLOSE.outdated)
  })

  it('ends after ten minutes with nobody in, writing the grid back as the Host’s progress', async () => {
    const host = await signedInUser(db, auth, 'host')
    const { code } = (await start(host.cookie)).body
    const h = connect(code, { cookie: host.cookie })
    await h.next('snapshot')
    h.send({ type: 'stroke', id: 1, changes: [{ i: 4, to: 'x' }] })
    await h.next('stroke')
    h.ws.close()
    // The server sees the close a moment after the client does.
    await until(async () => {
      const info = await coop.info(code, { userId: null, started: false }, null, null)
      return info?.access === 'join' && !info.seats[0]!.connected
    })
    clock += IDLE_END_MS
    await coop.sweep()
    const [row] = await db.select().from(progress).where(and(eq(progress.userId, host.id), eq(progress.puzzleId, 'bar')))
    expect(row?.cells).toBe('....x.')
    expect(await (await api.request(`/api/coop/${code}`)).json()).toEqual({ access: 'ended' })
  })

  it('autosaves the Host’s grid while live', async () => {
    const host = await signedInUser(db, auth, 'host')
    const { code } = (await start(host.cookie)).body
    const h = connect(code, { cookie: host.cookie })
    await h.next('snapshot')
    h.send({ type: 'stroke', id: 1, changes: [{ i: 2, to: 'x' }] })
    await h.next('stroke')
    clock += AUTOSAVE_MS
    await coop.sweep()
    const [row] = await db.select().from(progress).where(eq(progress.userId, host.id))
    expect(row?.cells).toBe('..x...')
  })

  it('survives a restart: saved on shutdown, and back on boot for its players', async () => {
    const host = await signedInUser(db, auth, 'host')
    const before = new CoopRooms({ db, auth, catalog, now: () => clock })
    const created = await before.create({ id: host.id, handle: 'host' }, 'bar')
    if ('status' in created) throw new Error('not created')
    await before.shutdown()
    expect(await db.select().from(coopRoom)).toHaveLength(1)

    const after = new CoopRooms({ db, auth, catalog, now: () => clock })
    expect(await after.restore()).toBe(1)
    expect(await db.select().from(coopRoom)).toHaveLength(0)
    expect(await after.info(created.code, { userId: null, started: false }, null, null)).toMatchObject({ access: 'join', host: 'host' })
  })
})
