import type { CoopServerMsg } from '@pixel-imperium/protocol'
import type { WebSocketLike } from './socket.ts'

/** A `WebSocket` the test opens, feeds and drops by hand. */
export class FakeSocket implements WebSocketLike {
  readyState = 0
  sent: Record<string, unknown>[] = []
  closedWith: number | null = null
  onopen: WebSocketLike['onopen'] = null
  onmessage: WebSocketLike['onmessage'] = null
  onclose: WebSocketLike['onclose'] = null

  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }
  close(code = 1000): void {
    this.closedWith = code
    this.readyState = 3
  }
  open(): void {
    this.readyState = 1
    this.onopen?.(new Event('open'))
  }
  receive(msg: CoopServerMsg): void {
    this.onmessage?.({ data: JSON.stringify(msg) } as MessageEvent)
  }
  drop(code = 1006): void {
    this.readyState = 3
    this.onclose?.({ code } as CloseEvent)
  }
}

/** A socket factory that keeps every socket it made, latest last. */
export function fakeSockets() {
  const made: FakeSocket[] = []
  return {
    made,
    latest: () => made.at(-1)!,
    create: () => {
      const ws = new FakeSocket()
      made.push(ws)
      return ws
    },
  }
}
