/**
 * READING A PERSON'S WALLET LIST (KIND 30889) WITHOUT LYING ABOUT IT.
 *
 * Two separate faults lived in the old reader, and both of them told the
 * person something untrue about their own money.
 *
 * 1. THE FREEZE WAS THROWN AWAY. A `w` tag has seven fields —
 *    ["w", address, type, coin, note, unregistered_lanoshi, freeze_reason] —
 *    and the parser read five. Index 6, the reason the registrar froze that
 *    wallet, never reached the wallet model, so the plan page offered a frozen
 *    wallet as a perfectly good source and only the registrar, later, said no.
 *    (UserProfileDialog re-fetched the raw event by hand precisely because the
 *    parser lost it — that workaround is what this replaces.)
 *
 * 2. SILENCE LOOKED LIKE AN ANSWER. `pool.querySync` resolves to `[]` in
 *    milliseconds when no relay connects at all: in nostr-tools 2.17.0
 *    `subscribeMany`'s handleClose calls handleEose first, so a relay that
 *    never opened counts as one that answered "nothing". No catch runs. An
 *    empty list then reads as "this wallet is not frozen" — the most dangerous
 *    reading available, because it is the permissive one.
 *
 * So the read reports three outcomes, not two: `found`, `empty` (at least one
 * relay genuinely answered and had nothing) and `unreachable` (nobody
 * answered). Callers that gate on a freeze must treat `unreachable` as "we do
 * not know" and stop — never as "not frozen".
 */
import { SimplePool } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';

export interface WalletInfo {
  wallet_address: string;
  wallet_type: string;
  coin: string;
  note: string;
  unregistered_lanoshi: number;
  /** Field 6 of the `w` tag: the registrar's freeze reason, '' when not frozen. */
  freeze_reason: string;
  /** Convenience for the above; a non-empty reason means frozen. */
  frozen: boolean;
}

export interface WalletListRecord {
  customer_hex: string;
  status: string;
  wallets: WalletInfo[];
  registrar_pubkey: string;
}

export type WalletListReadState = 'found' | 'empty' | 'unreachable';

export interface WalletListRead {
  state: WalletListReadState;
  records: WalletListRecord[];
  /** Relays that actually answered (connected and reached end-of-stored-events). */
  answered: string[];
  /** Relays that never answered — unreachable, or still silent at the timeout. */
  silent: string[];
}

/**
 * One `w` tag → one wallet. Tags written before the freeze field existed have
 * six entries or fewer; a missing field 6 is read as "no reason recorded",
 * which is the same thing the registrar writes for an unfrozen wallet.
 */
export function parseWalletTag(tag: string[]): WalletInfo {
  const reason = (tag[6] || '').trim();
  return {
    wallet_address: tag[1] || '',
    wallet_type: tag[2] || '',
    coin: tag[3] || 'LANA',
    note: tag[4] || '',
    unregistered_lanoshi: parseInt(tag[5] || '0', 10) || 0,
    freeze_reason: reason,
    frozen: reason.length > 0,
  };
}

/**
 * Events → records. Deduplicated per registrar, newest `created_at` winning:
 * taking `events[0]` off a merged array can hand back one relay's stale copy,
 * which is exactly how a freeze applied an hour ago disappears again.
 */
export function parseWalletRecords(events: Event[]): WalletListRecord[] {
  const latestByRegistrar = new Map<string, Event>();
  for (const event of events) {
    const existing = latestByRegistrar.get(event.pubkey);
    if (!existing || event.created_at > existing.created_at) {
      latestByRegistrar.set(event.pubkey, event);
    }
  }

  const records: WalletListRecord[] = [];
  for (const event of latestByRegistrar.values()) {
    const dTag = event.tags.find((t) => t[0] === 'd');
    const statusTag = event.tags.find((t) => t[0] === 'status');
    if (!dTag || !statusTag) continue;

    records.push({
      customer_hex: dTag[1],
      status: statusTag[1],
      wallets: event.tags.filter((t) => t[0] === 'w').map(parseWalletTag),
      registrar_pubkey: event.pubkey,
    });
  }
  return records;
}

/**
 * The verdict, kept pure so it can be tested without a network.
 *
 * Nobody answered → `unreachable`, whatever happens to be in `events`. That is
 * the whole point: an empty result proves nothing unless somebody was there to
 * produce it.
 */
export function classifyWalletListRead(input: {
  answered: string[];
  silent: string[];
  events: Event[];
}): WalletListRead {
  const { answered, silent, events } = input;

  if (answered.length === 0) {
    return { state: 'unreachable', records: [], answered: [], silent };
  }

  const records = parseWalletRecords(events);
  return {
    state: records.length > 0 ? 'found' : 'empty',
    records,
    answered,
    silent,
  };
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Read KIND 30889 for one person, relay by relay, so that "answered" means a
 * relay that opened a socket and reached end-of-stored-events — not one that
 * the pool gave up on. `ensureRelay` rejects on a connection that never
 * opened, which is the distinction `querySync` erases.
 */
export async function readKind30889(
  customerHexId: string,
  relayUrls: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<WalletListRead> {
  if (!relayUrls || relayUrls.length === 0) {
    return { state: 'unreachable', records: [], answered: [], silent: [] };
  }

  const filter: Filter = { kinds: [30889], '#d': [customerHexId] };
  const pool = new SimplePool();
  const answered: string[] = [];
  const silent: string[] = [];
  const events: Event[] = [];
  const seen = new Set<string>();

  const readOne = (url: string) =>
    new Promise<void>((resolve) => {
      let done = false;
      const finish = (ok: boolean) => {
        if (done) return;
        done = true;
        (ok ? answered : silent).push(url);
        resolve();
      };

      const timer = setTimeout(() => finish(false), timeoutMs);

      pool
        .ensureRelay(url)
        .then((relay) => {
          const sub = relay.subscribe([filter], {
            // nostr-tools fakes an EOSE after `baseEoseTimeout` (4.4 s) on a
            // relay that connected but stalls. Our own timer must fire first,
            // or a stalled relay is scored as one that answered "nothing".
            eoseTimeout: timeoutMs * 2,
            onevent: (event: Event) => {
              if (seen.has(event.id)) return;
              seen.add(event.id);
              events.push(event);
            },
            oneose: () => {
              clearTimeout(timer);
              // finish BEFORE close: Subscription.close() calls onclose
              // synchronously, which would record this relay as silent — as it
              // did for every relay until this line moved, so every read came
              // back `unreachable`.
              finish(true);
              try { sub.close(); } catch { /* already closed */ }
            },
            onclose: () => {
              // After EOSE this is our own sub.close() and `finish` has already
              // run. Before EOSE it is the relay dropping us, which proves
              // nothing about what it holds — so it counts as silence.
              clearTimeout(timer);
              finish(false);
            },
          });
        })
        .catch((error) => {
          console.warn(`[kind30889] ${url} did not answer:`, error);
          clearTimeout(timer);
          finish(false);
        });
    });

  try {
    await Promise.all(relayUrls.map(readOne));
  } finally {
    try { pool.close(relayUrls); } catch { /* nothing open */ }
  }

  return classifyWalletListRead({ answered, silent, events });
}
