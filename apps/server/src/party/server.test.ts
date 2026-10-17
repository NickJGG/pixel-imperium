import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { serve } from '@hono/node-server'
import { WebSocket } from 'ws'
import {
  type Friends,
  PARTY_CLOSE,
  PARTY_PROTOCOL,
  type PartyClientMsg,
  type PartyInfo,
  type PartyServerMsg,
} from '@pixel-imperium/protocol'
import { and, eq } from 'drizzle-orm'
import { createApi } from '../app.ts'
import { buildCampaign } from '../campaigns.ts'
import { createCatalog } from '../catalog.ts'
import { friendship, madePuzzle, party as partyTable, progress, solve } from '../db/schema.ts'
import { createTestDeps, signedInUser, truncateAll } from '../test-db.ts'
import { HOST_GRACE_MS } from './party.ts'
import { AUTOSAVE_MS, IDLE_END_MS, PartyHub } from './server.ts'

const bar = { id: 'bar', title: 'Bar', palette: { g: '#0f0' }, rows: ['gg.', '...'] }
const pole = { id: 'pole', title: 'Pole', palette: { g: '#0f0' }, rows: ['g..', 'g..'] }
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
  provinces: { one: [bar, pole] },
})

const { db, auth } = await createTestDeps()
let clock = 0
const catalog = createCatalog([campaign], { db })
let hub: PartyHub
let api: ReturnType<typeof createApi>
let server: Server
let port: number

beforeAll(async () => {
  hub = new PartyHub({ db, auth, catalog, now: () => clock })
  api = createApi(catalog, { db, auth, party: hub })
  server = serve({ fetch: api.fetch, port: 0 }) as Server
  hub.attach(server)
  await new Promise(resolve => server.once('listening', resolve))
  port = (server.address() as AddressInfo).port
})
let run = 0
beforeEach(async () => {
  run++
  await truncateAll(db)
})
/** Fresh to each test, so no guest is still seated in a Party an earlier one left. */
const device = (n = 0) => `device-token-${run}-${n}`
const sockets: WebSocket[] = []
afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.close()
  // Leaves nobody in a Party for the next test: everyone's sockets are gone, so it idles out.
  clock += IDLE_END_MS
  await hub.sweep()
})
afterAll(async () => {
  await hub.shutdown()
  await new Promise(resolve => server.close(resolve))
  await db.$client.end()
})

type Msg<T extends PartyServerMsg['type']> = Extract<PartyServerMsg, { type: T }>

interface Client {
  ws: WebSocket
  messages: PartyServerMsg[]
  send(msg: PartyClientMsg): void
  /** The first message of `type` not yet taken that passes `where`. */
  next<T extends PartyServerMsg['type']>(type: T, where?: (m: Msg<T>) => boolean): Promise<Msg<T>>
  closed: Promise<number>
}

/** A connected tab that has said `hello`. */
function connect({ cookie, token = device() }: { cookie?: string; token?: string } = {}): Client {
  const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers: cookie ? { cookie } : {} })
  sockets.push(ws)
  const messages: PartyServerMsg[] = []
  const waiters: (() => void)[] = []
  const taken = new Set<PartyServerMsg>()
  ws.on('message', data => {
    messages.push(JSON.parse(data.toString()))
    for (const w of waiters.splice(0)) w()
  })
  const send = (msg: PartyClientMsg) => ws.send(JSON.stringify(msg))
  ws.on('open', () => send({ type: 'hello', protocol: PARTY_PROTOCOL, deviceToken: token }))
  return {
    ws,
    messages,
    send,
    next: (type, where = () => true) =>
      new Promise(resolve => {
        const check = () => {
          const found = messages.find(m => m.type === type && !taken.has(m) && where(m as never))
          if (!found) return void waiters.push(check)
          taken.add(found)
          resolve(found as never)
        }
        check()
      }),
    closed: new Promise(resolve => ws.on('close', code => resolve(code))),
  }
}

const inParty = (m: Msg<'party'>) => m.party !== null

/** A signed-in Host on `puzzleId`'s page who presses Play with party; their Party's code. */
async function host(cookie: string, puzzleId = 'bar') {
  const c = connect({ cookie })
  await c.next('party')
  c.send({ type: 'here', puzzleId })
  c.send({ type: 'play', puzzleId })
  const { party } = await c.next('party', inParty)
  return { c, code: party!.code }
}

/** A tab joining by link while on `here`'s page; the Party it joined. */
async function join(c: Client, code: string, here: string | null = 'bar') {
  await c.next('party')
  c.send({ type: 'here', puzzleId: here })
  c.send({ type: 'join', code })
  return c.next('party', inParty)
}

async function befriend(x: string, y: string) {
  await db.insert(friendship).values(x < y ? { userA: x, userB: y } : { userA: y, userB: x })
}

async function until(check: () => Promise<boolean> | boolean) {
  for (let k = 0; k < 100 && !(await check()); k++) await new Promise(resolve => setTimeout(resolve, 10))
}

const info = (code: string) => hub.info(code, { userId: null, started: false }, null, null)

describe('play', () => {
  it('starts a Party from the Host’s grid, with the Host on its page getting it', async () => {
    const h = await signedInUser(db, auth, 'host')
    await db.insert(progress).values({ userId: h.id, puzzleId: 'bar', cells: 'x.....', updatedAt: new Date() })
    const { c } = await host(h.cookie)
    expect((await c.next('snapshot')).grid).toEqual({ puzzleId: 'bar', cells: 'x.....', solved: false })
  })

  it('starts a solved puzzle as a Replay from empty', async () => {
    const h = await signedInUser(db, auth, 'host')
    await db.insert(solve).values({ userId: h.id, puzzleId: 'bar', verified: true })
    await db.insert(progress).values({ userId: h.id, puzzleId: 'bar', cells: '##....', updatedAt: new Date() })
    const { c } = await host(h.cookie)
    expect((await c.next('snapshot')).grid.cells).toBe('......')
  })

  it('needs an account, and a puzzle that exists', async () => {
    const h = await signedInUser(db, auth, 'host')
    const g = connect()
    await g.next('party')
    g.send({ type: 'play', puzzleId: 'bar' })
    const c = connect({ cookie: h.cookie })
    await c.next('party')
    c.send({ type: 'play', puzzleId: 'nope' })
    c.send({ type: 'start' })
    expect((await c.next('party', inParty)).party!.puzzle).toBeNull()
    expect(g.messages.filter(m => m.type === 'party')).toEqual([{ type: 'party', party: null, you: null }])
  })

  it('is the Host’s alone once in a Party', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const { code } = await host(h.cookie)
    const a = connect({ cookie: ada.cookie })
    await join(a, code)
    a.send({ type: 'play', puzzleId: 'pole' })
    a.send({ type: 'here', puzzleId: null })
    await a.next('seats', m => m.seats.some(s => s.name === 'ada' && !s.here))
    expect((await info(code))).toMatchObject({ puzzle: { id: 'bar' } })
  })

  it('moves tabs on the old puzzle’s page with the Host, and tells members elsewhere it started', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const bo = await signedInUser(db, auth, 'bo')
    const { c, code } = await host(h.cookie)
    const a = connect({ cookie: ada.cookie })
    const b = connect({ cookie: bo.cookie })
    await join(a, code, 'bar')
    await join(b, code, null)
    await a.next('snapshot')
    c.send({ type: 'here', puzzleId: 'pole' })
    c.send({ type: 'play', puzzleId: 'pole' })
    expect(await a.next('move')).toEqual({ type: 'move', puzzleId: 'pole' })
    expect((await a.next('snapshot')).grid.puzzleId).toBe('pole')
    expect(await b.next('started')).toEqual({ type: 'started', puzzleId: 'pole', title: 'Pole', by: 'host' })
    expect(b.messages.some(m => m.type === 'move' || m.type === 'snapshot')).toBe(false)
    expect(c.messages.some(m => m.type === 'started')).toBe(false)
  })

  it('writes an unsolved grid back as the Host’s progress on moving on', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { c } = await host(h.cookie)
    await c.next('snapshot')
    c.send({ type: 'stroke', id: 1, changes: [{ i: 3, to: 'x' }] })
    await c.next('stroke')
    c.send({ type: 'play', puzzleId: 'pole' })
    await c.next('party', m => m.party?.puzzle?.id === 'pole')
    const [row] = await db.select().from(progress).where(and(eq(progress.userId, h.id), eq(progress.puzzleId, 'bar')))
    expect(row?.cells).toBe('...x..')
  })
})

describe('GET /api/party/:code', () => {
  it('names the Host, puzzle and seats, and the guest name a device would join as', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { code } = await host(h.cookie)
    const res = await api.request(`/api/party/${code}?device=${device(2)}`)
    expect(await res.json()).toMatchObject({
      access: 'join',
      host: 'host',
      puzzle: { id: 'bar', title: 'Bar' },
      seats: [{ seat: 0, name: 'host', account: true, connected: true, here: true, cursor: null }],
      you: expect.stringMatching(/^Guest /),
    } satisfies Partial<PartyInfo>)
  })

  it('is 404 for a code that never was', async () => {
    expect((await api.request('/api/party/nothere1')).status).toBe(404)
  })
})

describe('the shared grid', () => {
  it('relays strokes to everyone, and on a solve records a non-foil Verified solve with no Best time', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const { c, code } = await host(h.cookie)
    const a = connect({ cookie: ada.cookie })
    expect((await join(a, code)).you).toBe(1)
    await a.next('snapshot')
    await c.next('snapshot')

    c.send({ type: 'stroke', id: 7, changes: [{ i: 0, to: '#' }] })
    expect(await a.next('stroke')).toEqual({ type: 'stroke', id: 7, by: 0, changes: [{ i: 0, to: '#' }] })
    a.send({ type: 'stroke', id: 1, changes: [{ i: 1, to: '#' }] })

    for (const x of [c, a]) {
      const solved = await x.next('solved')
      expect(solved).toMatchObject({ palette: ['#0f0', '#0f0', null, null, null, null], foil: false })
      expect(solved.stamps?.near).toBeDefined()
    }
    const rows = await db.select().from(solve).where(eq(solve.puzzleId, 'bar'))
    expect(rows.map(r => [r.userId, r.verified, r.foil, r.bestMs]).sort()).toEqual(
      [
        [h.id, true, false, null],
        [ada.id, true, false, null],
      ].sort(),
    )
  })

  it('takes no strokes from a tab off the puzzle’s page', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { c, code } = await host(h.cookie)
    await c.next('snapshot')
    const g = connect()
    await join(g, code, null)
    g.send({ type: 'stroke', id: 1, changes: [{ i: 0, to: '#' }] })
    g.send({ type: 'here', puzzleId: 'bar' })
    expect((await g.next('snapshot')).grid.cells).toBe('......')
  })

  it('lets a signed-out guest in under a generated name, and records nothing for them', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { code } = await host(h.cookie)
    const g = connect()
    const { party, you } = await join(g, code)
    expect(party!.seats.find(s => s.seat === you)).toMatchObject({ account: false, name: expect.stringMatching(/^Guest /) })
    await g.next('snapshot')
    g.send({ type: 'stroke', id: 1, changes: [{ i: 0, to: '#' }, { i: 1, to: '#' }] })
    await g.next('solved')
    await until(async () => (await db.select().from(solve)).length > 0)
    expect(await db.select().from(solve).where(eq(solve.puzzleId, 'bar'))).toEqual([expect.objectContaining({ userId: h.id })])
  })

  it('records nothing for an Author hosting their own puzzle, but does for their guests', async () => {
    const author = await signedInUser(db, auth, 'author')
    const ada = await signedInUser(db, auth, 'ada')
    const id = 'abcde12345'
    await db.insert(madePuzzle).values({ id, authorId: author.id, title: 'Bar', seed: { ...bar, id }, passes: 1 })
    const { c, code } = await host(author.cookie, id)
    const a = connect({ cookie: ada.cookie })
    await join(a, code, id)
    await a.next('snapshot')
    c.send({ type: 'stroke', id: 1, changes: [{ i: 0, to: '#' }, { i: 1, to: '#' }] })
    await a.next('solved')
    await c.next('solved')
    const rows = await db.select().from(solve).where(eq(solve.puzzleId, id))
    expect(rows.map(r => r.userId)).toEqual([ada.id])
  })
})

describe('membership', () => {
  it('removes a member for good', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { c, code } = await host(h.cookie)
    const g = connect()
    const { you } = await join(g, code)
    c.send({ type: 'remove', seat: you! })
    await g.next('removed')
    expect(await g.next('party')).toEqual({ type: 'party', party: null, you: null })
    g.send({ type: 'join', code })
    expect(await g.next('refused')).toEqual({ type: 'refused', reason: 'removed' })
  })

  it('turns a fifth player away as full', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { code } = await host(h.cookie)
    for (const n of [1, 2, 3]) await join(connect({ token: device(n) }), code)
    const late = connect({ token: device(9) })
    await late.next('party')
    late.send({ type: 'join', code })
    expect(await late.next('refused')).toEqual({ type: 'refused', reason: 'full' })
  })

  it('moves to a New link: the old one keeps its players but takes no one new', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { c, code } = await host(h.cookie)
    const g = connect()
    await join(g, code)
    c.send({ type: 'newLink' })
    const { code: fresh } = await g.next('link')
    expect(fresh).not.toBe(code)
    g.ws.close()
    expect((await join(connect(), code)).party!.code).toBe(fresh)
    const other = connect({ token: device(9) })
    await other.next('party')
    other.send({ type: 'join', code })
    expect(await other.next('refused')).toEqual({ type: 'refused', reason: 'ended' })
  })

  it('keeps a player in one Party: joining another leaves the first', async () => {
    const h = await signedInUser(db, auth, 'host')
    const bo = await signedInUser(db, auth, 'bo')
    const ada = await signedInUser(db, auth, 'ada')
    const first = await host(h.cookie)
    const second = await host(bo.cookie, 'pole')
    const a = connect({ cookie: ada.cookie })
    await join(a, first.code)
    a.send({ type: 'start' })
    a.send({ type: 'join', code: second.code })
    expect((await a.next('party', m => m.party?.code === second.code)).you).toBe(1)
    expect((await info(first.code)) as { seats: unknown[] }).toMatchObject({ seats: [{ name: 'host' }] })
  })

  it('shows every tab of a player as one seat, Away until one is on the puzzle’s page', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const { c, code } = await host(h.cookie)
    const a1 = connect({ cookie: ada.cookie })
    await join(a1, code, null)
    const a2 = connect({ cookie: ada.cookie })
    expect((await a2.next('party', inParty)).you).toBe(1)
    expect((await c.next('seats', m => m.seats.length === 2)).seats[1]).toMatchObject({ connected: true, here: false })
    a2.send({ type: 'here', puzzleId: 'bar' })
    await a2.next('snapshot')
    await c.next('seats', m => m.seats[1]?.here === true)
  })

  it('asks a client on another protocol to reload', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    sockets.push(ws)
    ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', deviceToken: 'device-token-0000000001', protocol: 0 })))
    expect(await new Promise(resolve => ws.on('close', resolve))).toBe(PARTY_CLOSE.outdated)
  })

  it('closes a tab that skips hello', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`)
    sockets.push(ws)
    ws.on('open', () => ws.send(JSON.stringify({ type: 'start' })))
    expect(await new Promise(resolve => ws.on('close', resolve))).toBe(PARTY_CLOSE.notAllowed)
  })
})

describe('the Host', () => {
  it('passes on leaving, and the leaver is out', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const { c, code } = await host(h.cookie)
    const a = connect({ cookie: ada.cookie })
    const { you: seat } = await join(a, code)
    c.send({ type: 'leave' })
    expect(await a.next('host')).toEqual({ type: 'host', seat })
    expect(await c.next('party', m => m.party === null)).toEqual({ type: 'party', party: null, you: null })
    expect(await info(code)).toMatchObject({ host: 'ada', seats: [{ name: 'ada' }] })
  })

  it('ends the Party when it leaves with only guests left', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { c, code } = await host(h.cookie)
    const g = connect()
    await join(g, code)
    c.send({ type: 'leave' })
    expect(await g.next('ended')).toEqual({ type: 'ended', reason: 'hostless' })
    expect(await info(code)).toEqual({ access: 'ended' })
  })

  it('passes to the longest-seated signed-in member once gone past the grace', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const bo = await signedInUser(db, auth, 'bo')
    const { c, code } = await host(h.cookie)
    await join(connect(), code)
    const a = connect({ cookie: ada.cookie })
    const { you: adaSeat } = await join(a, code)
    await join(connect({ cookie: bo.cookie }), code)
    c.ws.close()
    await a.next('seats', m => m.seats[0]?.connected === false)
    clock += HOST_GRACE_MS - 1
    await hub.sweep()
    expect(a.messages.some(m => m.type === 'host')).toBe(false)
    clock += 1
    await hub.sweep()
    expect(await a.next('host')).toEqual({ type: 'host', seat: adaSeat })
  })

  it('hands over by Make Host', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const { c, code } = await host(h.cookie)
    const a = connect({ cookie: ada.cookie })
    const { you: seat } = await join(a, code)
    c.send({ type: 'makeHost', seat: seat! })
    expect(await a.next('host')).toEqual({ type: 'host', seat })
    a.send({ type: 'play', puzzleId: 'pole' })
    await c.next('party', m => m.party?.puzzle?.id === 'pole')
  })

  it('ends the Party for everyone on End party', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { c, code } = await host(h.cookie)
    const g = connect()
    await join(g, code)
    c.send({ type: 'end' })
    expect(await g.next('ended')).toEqual({ type: 'ended', reason: 'host' })
    expect(g.ws.readyState).toBe(WebSocket.OPEN)
  })
})

describe('invites', () => {
  it('reach a friend, and accepting moves them out of their old Party', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const bo = await signedInUser(db, auth, 'bo')
    await befriend(h.id, ada.id)
    const old = await host(ada.cookie, 'pole')
    const b = connect({ cookie: bo.cookie })
    const { you: boSeat } = await join(b, old.code, 'pole')
    const { c, code } = await host(h.cookie)

    c.send({ type: 'invite', handle: 'ADA' })
    const { invite } = await old.c.next('invite')
    expect(invite).toMatchObject({ from: 'host', host: 'host', size: 1, puzzle: { id: 'bar', title: 'Bar' } })
    old.c.send({ type: 'respond', inviteId: invite.id, accept: true })
    expect(await old.c.next('uninvite')).toEqual({ type: 'uninvite', id: invite.id })
    expect((await old.c.next('party', m => m.party?.code === code)).you).toBe(1)
    expect(await b.next('host')).toEqual({ type: 'host', seat: boSeat })
  })

  it('go to friends only, and wait for them to come online', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const bo = await signedInUser(db, auth, 'bo')
    await befriend(h.id, ada.id)
    const { c } = await host(h.cookie)
    c.send({ type: 'invite', handle: 'bo' })
    c.send({ type: 'invite', handle: 'ada' })
    const a = connect({ cookie: ada.cookie })
    const b = connect({ cookie: bo.cookie })
    await a.next('invite')
    await b.next('party')
    expect(b.messages.some(m => m.type === 'invite')).toBe(false)
  })

  it('are dropped when declined or when their Party ends', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    await befriend(h.id, ada.id)
    const { c } = await host(h.cookie)
    const a = connect({ cookie: ada.cookie })
    await a.next('party')
    c.send({ type: 'invite', handle: 'ada' })
    const first = (await a.next('invite')).invite
    a.send({ type: 'respond', inviteId: first.id, accept: false })
    await a.next('uninvite')
    c.send({ type: 'invite', handle: 'ada' })
    const second = (await a.next('invite')).invite
    c.send({ type: 'end' })
    expect(await a.next('uninvite')).toEqual({ type: 'uninvite', id: second.id })
    a.send({ type: 'respond', inviteId: second.id, accept: true })
    a.send({ type: 'start' })
    expect((await a.next('party', inParty)).you).toBe(0)
  })
})

describe('presence', () => {
  it('goes to friends only, as players come online, join a Party and go', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const bo = await signedInUser(db, auth, 'bo')
    await befriend(h.id, ada.id)
    const c = connect({ cookie: h.cookie })
    expect(await c.next('presence')).toEqual({ type: 'presence', friends: [{ handle: 'ada', online: false, party: null }], full: true })
    const b = connect({ cookie: bo.cookie })
    expect(await b.next('presence')).toEqual({ type: 'presence', friends: [], full: true })

    const a = connect({ cookie: ada.cookie })
    expect((await a.next('presence')).friends).toEqual([{ handle: 'host', online: true, party: null }])
    expect(await c.next('presence', m => !m.full)).toEqual({ type: 'presence', friends: [{ handle: 'ada', online: true, party: null }], full: false })
    a.send({ type: 'start' })
    expect((await c.next('presence', m => !m.full)).friends).toEqual([{ handle: 'ada', online: true, party: 1 }])
    a.ws.close()
    expect((await c.next('presence', m => !m.full)).friends).toEqual([{ handle: 'ada', online: false, party: 1 }])
    expect(b.messages.filter(m => m.type === 'presence')).toHaveLength(1)
  })

  it('shows on GET /api/me/friends, online first', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const zed = await signedInUser(db, auth, 'zed')
    await befriend(h.id, ada.id)
    await befriend(h.id, zed.id)
    const z = connect({ cookie: zed.cookie })
    await z.next('party')
    z.send({ type: 'start' })
    await z.next('party', inParty)
    const res = await api.request('/api/me/friends', { headers: { cookie: h.cookie } })
    expect(((await res.json()) as Friends).friends).toEqual([
      expect.objectContaining({ handle: 'zed', online: true, party: 1 }),
      expect.objectContaining({ handle: 'ada', online: false, party: null }),
    ])
  })

  it('pushes a friend request, and the new friend once accepted', async () => {
    const h = await signedInUser(db, auth, 'host')
    const ada = await signedInUser(db, auth, 'ada')
    const a = connect({ cookie: ada.cookie })
    await a.next('presence')
    const c = connect({ cookie: h.cookie })
    await c.next('presence')
    await api.request('/api/me/friends/requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: h.cookie },
      body: JSON.stringify({ handle: 'ada' }),
    })
    expect(await a.next('friendRequest')).toEqual({ type: 'friendRequest', from: 'host' })
    await api.request('/api/me/friends/requests/host/accept', { method: 'POST', headers: { cookie: ada.cookie } })
    expect(await c.next('presence', m => m.full)).toEqual({ type: 'presence', friends: [{ handle: 'ada', online: true, party: null }], full: true })
  })
})

describe('lifetime', () => {
  it('ends after ten minutes with nobody in, writing the grid back as the Host’s progress', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { c, code } = await host(h.cookie)
    await c.next('snapshot')
    c.send({ type: 'stroke', id: 1, changes: [{ i: 4, to: 'x' }] })
    await c.next('stroke')
    c.ws.close()
    // The server sees the close a moment after the client does.
    await until(async () => {
      const i = await info(code)
      return i?.access === 'join' && !i.seats[0]!.connected
    })
    clock += IDLE_END_MS
    await hub.sweep()
    const [row] = await db.select().from(progress).where(and(eq(progress.userId, h.id), eq(progress.puzzleId, 'bar')))
    expect(row?.cells).toBe('....x.')
    expect(await (await api.request(`/api/party/${code}`)).json()).toEqual({ access: 'ended' })
  })

  it('autosaves the grid while live', async () => {
    const h = await signedInUser(db, auth, 'host')
    const { c } = await host(h.cookie)
    await c.next('snapshot')
    c.send({ type: 'stroke', id: 1, changes: [{ i: 2, to: 'x' }] })
    await c.next('stroke')
    clock += AUTOSAVE_MS
    await hub.sweep()
    const [row] = await db.select().from(progress).where(eq(progress.userId, h.id))
    expect(row?.cells).toBe('..x...')
  })

  it('survives a restart: saved on shutdown, and back on boot for its players', async () => {
    const h = await signedInUser(db, auth, 'host')
    const before = new PartyHub({ db, auth, catalog, now: () => clock })
    await db.insert(partyTable).values({
      code: 'saved123',
      previousCodes: [],
      hostId: h.id,
      hostSeat: 0,
      seats: [{ identity: `user:${h.id}`, userId: h.id, name: 'host', joined: 0 }],
      removed: [],
      grid: { puzzleId: 'bar', ownerId: h.id, cells: '.#....', solved: false, replaying: false },
    })
    expect(await before.restore()).toBe(1)
    await before.shutdown()
    expect(await db.select().from(partyTable)).toHaveLength(1)

    const after = new PartyHub({ db, auth, catalog, now: () => clock })
    expect(await after.restore()).toBe(1)
    expect(await db.select().from(partyTable)).toHaveLength(0)
    expect(await after.info('saved123', { userId: null, started: false }, null, null)).toMatchObject({
      access: 'join',
      host: 'host',
      puzzle: { id: 'bar' },
    })
  })
})
