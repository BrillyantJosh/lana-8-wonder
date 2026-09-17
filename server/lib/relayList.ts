/**
 * WHERE THE RELAYS COME FROM (server side).
 *
 * The four Lana relays are named in exactly one place: the `relay` tags of the
 * newest KIND 38888 (d=main) signed by the parameters authority. Four files in
 * this server each used to keep their own copy of that list instead, and the
 * copies had drifted: all four still carried `relay.lanacoin-eternity.com` —
 * an old alias of relay.lana-eternity.com, the same host, not in 38888 — and
 * none of them carried relay.lovelana.org, which is. So a reader could miss
 * the one relay that held the answer and then report the absence as fact.
 *
 * BOOTSTRAP_RELAYS below is NOT a second source of truth. It is what we use to
 * FIND KIND 38888 itself, and it is deliberately the full four, because a
 * short bootstrap turns one unreachable relay into a blackout — and a blackout
 * here is not read as "we could not look", it is read as "there is nothing".
 *
 * See src/lib/relayBootstrap.ts for the browser-side twin; the two lists are
 * asserted equal by scripts/testFreezeVisibility.ts so they cannot drift.
 */
import { SimplePool } from 'nostr-tools/pool';
import WebSocket from 'ws';

// nostr-tools' SimplePool needs a global WebSocket; node 20 has none. Without
// this the pool reports "failed to publish" without ever having tried.
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

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
 * Pull the relay tags out of a KIND 38888 event. Empty array when the event
 * carries none — the caller decides what that means, because "38888 listed
 * nothing" and "we never reached 38888" are different facts.
 */
export function relaysFromKind38888(event: { tags: string[][] } | null | undefined): string[] {
  if (!event?.tags) return [];
  return event.tags
    .filter((t) => t[0] === 'relay' && typeof t[1] === 'string' && t[1].length > 0)
    .map((t) => t[1]);
}

let cached: { relays: string[]; at: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000;

/**
 * The relay list to use for everything that is not the search for 38888
 * itself. Prefers the published list; falls back to the bootstrap, loudly,
 * and never to a shorter or staler set than the bootstrap.
 */
export async function getLanaRelays(): Promise<string[]> {
  if (cached && Date.now() - cached.at < CACHE_TTL) return cached.relays;

  const pool = new SimplePool();
  try {
    const events = await pool.querySync(BOOTSTRAP_RELAYS, {
      kinds: [38888],
      authors: [KIND_38888_AUTHORIZED_PUBKEY],
      '#d': ['main'],
      limit: 1,
    });

    // Newest wins. `events[0]` off a merged array can be one relay's stale
    // copy, which is how a retired relay list comes back from the dead.
    const latest = (events || []).sort((a, b) => b.created_at - a.created_at)[0];
    const relays = relaysFromKind38888(latest);

    if (relays.length === 0) {
      console.warn('[relayList] KIND 38888 gave no relay tags — falling back to the bootstrap list');
      return BOOTSTRAP_RELAYS;
    }

    cached = { relays, at: Date.now() };
    return relays;
  } catch (error) {
    console.error('[relayList] Could not read KIND 38888 — falling back to the bootstrap list:', error);
    return BOOTSTRAP_RELAYS;
  } finally {
    pool.close(BOOTSTRAP_RELAYS);
  }
}
