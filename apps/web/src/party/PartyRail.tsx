import { Link } from '@tanstack/react-router'
import type { HintResponse, PartyState } from '@pixel-imperium/protocol'
import { ArrowIcon } from '../album/icons.tsx'
import { NextUp } from '../campaign/NextUp.tsx'
import { PadGlyph } from '../pad/PadGlyph.tsx'
import type { NextPick } from '../play/PlayPage.tsx'
import type { ProgressStorage } from '../play/progress-storage.ts'
import { backLink } from '../tutorial/handoff.ts'
import { PeopleIcon } from './PartyCard.tsx'
import { party as session } from './party-store.ts'
import { namesOf, seatLabel } from './seats.ts'
import styles from './Party.module.css'
import play from '../play/Play.module.css'

/** Who a partner's hint on show came from; `null` for this player's own. */
export function partyHintNote(party: PartyState, you: number | null, by: number | null, hint: HintResponse): string | null {
  if (by === null || by === you) return null
  const seat = party.seats.find(s => s.seat === by)
  const name = seat ? seatLabel(seat, true) : 'A partner'
  return hint.kind === 'reveal' ? `${name} revealed a cell.` : `${name} found a mistake.`
}

interface Props {
  party: PartyState
  you: number | null
  /** The Host's Next for Next together, or a guest's own. */
  next: NextPick | null
  storage: ProgressStorage
  /** Where a guest who leaves goes. */
  leaveTo: string
  /** The after sheet's, which names the next puzzle on its buttons; the rail shows Next up instead. */
  named: boolean
}

/**
 * The solved rail's way on in a Party, which carries on after the Reveal: the Host picks Next together (or goes on
 * alone), and guests wait for them, leave, or go on alone.
 */
export function PartyOnward({ party, you, next, storage, leaveTo, named }: Props) {
  const host = you === party.host
  const others = party.seats.filter(s => s.seat !== you)
  const withWho = others.length > 0 ? `Solved with ${namesOf(others)}.` : ''
  const hostSeat = party.seats.find(s => s.seat === party.host)
  const nextName = next && named && (
    <small>
      #{next.number} {next.puzzle.title}
    </small>
  )
  const nextUp = next && !named && <NextUp puzzle={next.puzzle} number={next.number} storage={storage} />
  const solo = next && (
    <Link to="/play/$id" params={{ id: next.puzzle.id }} data-variant="paper" data-pad-default={!host || undefined}>
      Next on my own
      {!host && nextName}
      {!host && <ArrowIcon />}
    </Link>
  )

  if (host) {
    return (
      <>
        {withWho && <p className={play.railNote}>{withWho}</p>}
        {nextUp}
        {next && (
          <button type="button" data-variant="primary" data-pad-default onClick={() => session.play(next.puzzle.id)}>
            <PeopleIcon />
            Next together
            {nextName}
            <ArrowIcon />
            <PadGlyph button="A" />
          </button>
        )}
        {solo}
      </>
    )
  }
  return (
    <>
      <div className={styles.waiting}>
        <h2>Party</h2>
        <p>
          {withWho} Waiting for {hostSeat ? seatLabel(hostSeat) : 'the Host'} to pick the next puzzle.
        </p>
        <Link
          {...backLink(leaveTo)}
          data-variant="flat"
          data-size="compact"
          data-pad-default={!next || undefined}
          onClick={() => session.leave()}
        >
          Leave party
        </Link>
      </div>
      {nextUp}
      {solo}
    </>
  )
}
