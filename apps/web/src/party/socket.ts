/**
 * The party connection: `/ws` on this origin, so the session cookie rides along. It says `hello` on every open, and is
 * live once the server answers with the player's `party`; after a drop it reconnects with exponential backoff and
 * jitter, and the server's answers to the new `hello` are the whole truth, so nothing needs replaying. A close the
 * server means as final (not allowed, outdated) ends it.
 */
import { PARTY_CLOSE, type PartyClientMsg, type PartyServerMsg } from '@pixel-imperium/protocol'

export type PartyEnd = 'not-allowed' | 'outdated'

export type SocketStatus = 'connecting' | 'live' | 'reconnecting'

/** The part of `WebSocket` used here, for tests to fake. */
export interface WebSocketLike {
  readonly readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((ev: Event) => void) | null
  onmessage: ((ev: MessageEvent) => void) | null
  onclose: ((ev: CloseEvent) => void) | null
}

export interface PartySocketHandlers {
  hello: () => Extract<PartyClientMsg, { type: 'hello' }>
  onMessage: (msg: PartyServerMsg) => void
  onStatus: (status: SocketStatus) => void
  onEnd: (reason: PartyEnd) => void
}

export interface PartySocketEnv {
  create?: (url: string) => WebSocketLike
  url?: string
  random?: () => number
}

const OPEN = 1
export const BACKOFF_BASE_MS = 500
export const BACKOFF_MAX_MS = 15_000

const FINAL: Partial<Record<number, PartyEnd>> = {
  [PARTY_CLOSE.notAllowed]: 'not-allowed',
  [PARTY_CLOSE.outdated]: 'outdated',
}

/** The wait before reconnect attempt `attempt` (from 0): half the capped exponential step, plus up to as much again. */
export function backoffMs(attempt: number, random: () => number = Math.random): number {
  const step = Math.min(BACKOFF_MAX_MS, BACKOFF_BASE_MS * 2 ** attempt)
  return step / 2 + random() * (step / 2)
}

const sameOriginUrl = () => `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

export class PartySocket {
  private ws: WebSocketLike | null = null
  private attempt = 0
  private timer: ReturnType<typeof setTimeout> | null = null
  private live = false
  /** Live at least once, so a drop is a reconnect. */
  private joined = false
  private stopped = false
  private readonly create: (url: string) => WebSocketLike
  private readonly url: string
  private readonly random: () => number

  constructor(
    private readonly handlers: PartySocketHandlers,
    { create = url => new WebSocket(url), url = sameOriginUrl(), random = Math.random }: PartySocketEnv = {},
  ) {
    this.create = create
    this.url = url
    this.random = random
    this.open()
  }

  /** Sends while live; `false` while connecting, or once closed. */
  send(msg: PartyClientMsg): boolean {
    if (!this.live || this.ws?.readyState !== OPEN) return false
    this.ws.send(JSON.stringify(msg))
    return true
  }

  close(): void {
    this.stopped = true
    if (this.timer !== null) clearTimeout(this.timer)
    this.timer = null
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      ws.close(1000, 'left')
    }
  }

  private open(): void {
    this.timer = null
    this.handlers.onStatus(this.joined ? 'reconnecting' : 'connecting')
    const ws = this.create(this.url)
    this.ws = ws
    ws.onopen = () => ws.send(JSON.stringify(this.handlers.hello()))
    ws.onmessage = ({ data }) => {
      let msg: PartyServerMsg
      try {
        msg = JSON.parse(String(data)) as PartyServerMsg
      } catch {
        return
      }
      if (msg.type === 'outdated') return this.finish('outdated')
      if (msg.type === 'party' && !this.live) {
        this.attempt = 0
        this.live = true
        this.joined = true
        this.handlers.onStatus('live')
      }
      this.handlers.onMessage(msg)
    }
    ws.onclose = ({ code }) => {
      if (this.ws !== ws) return
      this.ws = null
      this.live = false
      const final = FINAL[code]
      if (final) return this.finish(final)
      // A restart saved the parties; back at once rather than after a backoff.
      if (code === PARTY_CLOSE.restarting) this.attempt = 0
      if (this.joined) this.handlers.onStatus('reconnecting')
      this.timer = setTimeout(() => this.open(), backoffMs(this.attempt++, this.random))
    }
  }

  private finish(reason: PartyEnd): void {
    if (this.stopped) return
    this.close()
    this.handlers.onEnd(reason)
  }
}
