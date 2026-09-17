/**
 * WHERE THE RELAYS COME FROM.
 *
 * There are four Lana relays and they are named in exactly one place: the
 * `relay` tags of the newest KIND 38888 (d=main) signed by the parameters
 * authority. Every reader and every publisher takes its list from there.
 *
 * The list below is NOT a second source of truth. It is the bootstrap — the
 * addresses used to FIND KIND 38888 itself, and nothing else. Once 38888 is
 * in hand, its tags win.
 *
 * Two rules it has been broken by before:
 *
 * 1. It must not be SHORTER than 38888. A two-address bootstrap turns one
 *    unreachable relay into a coin-flip and two into a total blackout, and a
 *    blackout here reads downstream as "this person has nothing" rather than
 *    as "we could not look".
 * 2. It must not contain `relay.lanacoin-eternity.com`. That is an old alias
 *    of relay.lana-eternity.com — the same host, 157.245.124.136 — it is not
 *    in KIND 38888, and counting it as a separate relay made an event that
 *    all four relays accepted report itself as "sent to 2 of 5". It reads as
 *    a failure when nothing failed. It must not come back.
 *
 * Verified against the live KIND 38888 on 17.9.2026.
 */
export const KIND_38888_AUTHORIZED_PUBKEY =
  '9eb71bf1e9c3189c78800e4c3831c1c1a93ab43b61118818c32e4490891a35b3';

export const BOOTSTRAP_RELAYS: string[] = [
  'wss://relay.lanavault.space',
  'wss://relay.lana-eternity.com',
  'wss://relay.lanaheartvoice.com',
  'wss://relay.lovelana.org',
];

/** The alias that must never be treated as a relay of its own. */
export const RETIRED_RELAY_ALIASES: string[] = [
  'relay.lanacoin-eternity.com',
];

/**
 * Pull the relay tags out of a KIND 38888 event. Returns an empty array when
 * the event carries none, so the caller can decide what to do — this function
 * never substitutes the bootstrap list, because "38888 said nothing" and
 * "we never read 38888" are different facts and only the caller knows which
 * one it is holding.
 */
export function relaysFromKind38888(event: { tags: string[][] } | null | undefined): string[] {
  if (!event?.tags) return [];
  return event.tags
    .filter((t) => t[0] === 'relay' && typeof t[1] === 'string' && t[1].length > 0)
    .map((t) => t[1]);
}
