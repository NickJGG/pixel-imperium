/**
 * The invite slip beside the party sticker: what it shows, and its tuck into the sticker's pink dot after a while on
 * show. The Party column keeps what tucked until it's answered. Items are told apart by identity, since the session
 * keeps an invite's or a Started's object for as long as it stands.
 */
import type { PartyInvite } from '@pixel-imperium/protocol'
import type { PartyView, Started } from './session.ts'

export const SLIP_MS = 12_000

export type Slip = { kind: 'invite'; invite: PartyInvite } | { kind: 'started'; started: Started }

/** The Party's new puzzle before any invite, else the newest invite, skipping whatever has tucked. */
export function pickSlip(view: Pick<PartyView, 'invites' | 'started'>, tucked: (item: object) => boolean): Slip | null {
  if (view.started && !tucked(view.started)) return { kind: 'started', started: view.started }
  const invite = view.invites.findLast(i => !tucked(i))
  return invite ? { kind: 'invite', invite } : null
}

export const slipItem = (slip: Slip): object => (slip.kind === 'invite' ? slip.invite : slip.started)

/** The sticker's pink dot: anything unanswered, whether or not its slip has tucked. */
export const waiting = (view: Pick<PartyView, 'invites' | 'started' | 'friendRequests' | 'notice'>): boolean =>
  view.invites.length > 0 || view.started !== null || view.friendRequests.length > 0 || view.notice !== null

export class Tucks {
  private readonly tucked = new WeakSet<object>()
  private readonly timing = new WeakSet<object>()
  private readonly listeners = new Set<() => void>()
  private version = 0

  readonly has = (item: object): boolean => this.tucked.has(item)

  /** Starts `item`'s time on show, once however many slips show it. */
  shown(item: object): void {
    if (this.timing.has(item)) return
    this.timing.add(item)
    setTimeout(() => {
      this.tucked.add(item)
      this.version++
      for (const listener of this.listeners) listener()
    }, SLIP_MS)
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getVersion = (): number => this.version
}

export const tucks = new Tucks()
