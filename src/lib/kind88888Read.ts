/**
 * READING A PERSON'S LANA8WONDER PLAN (KIND 88888) WITHOUT LYING ABOUT IT.
 *
 * The old reader was `pool.querySync` and returned `null` for two different
 * facts: "the relays answered and this person has no plan" and "no relay
 * answered at all". In nostr-tools 2.17.0 `subscribeMany`'s handleClose calls
 * handleEose first, so a relay that never opened counts as one that answered
 * "nothing" — a total blackout resolves to `[]` in milliseconds and no catch
 * runs.
 *
 * `null` was then read as a verdict. The dashboard told a plan holder "No
 * annuity plan found" and sent them to /create-lana8wonder — the page that
 * takes a deposit for a NEW plan. Login did the same. A sister page elsewhere
 * printed sixteen doubling levels derived from today's price on the same empty
 * read: three untruths at once, in the view a holder opens to read their own
 * payout schedule.
 *
 * So the read reports three outcomes, as kind30889Read.ts does:
 *   `found`       — a plan event from the publisher is in hand;
 *   `empty`       — at least one relay genuinely answered and had none;
 *   `unreachable` — we cannot say. Nobody answered, or the newest plan could
 *                   not be parsed. Either way it is NOT "you have no plan", and
 *                   no page may route anyone to buy one on it.
 *
 * One deliberate difference from the wallet-list read: a plan event in hand
 * counts as `found` even if its relay dropped before end-of-stored-events.
 * For the wallet list the permissive reading of a half-answer is "not frozen",
 * which is dangerous; here the event itself is the evidence — signed by the
 * publisher and checked against the filter by the relay layer — and throwing
 * it away would turn a plan holder into a non-holder over a missing EOSE.
 */
import { SimplePool } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';

/** The key the Lana8Wonder server publishes every plan with. */
export const KIND_88888_PUBLISHER = 'a56253e6232b2ab5a96b60d233434d4f759ba4c858a3cc0f4ec51906dce73ae6';

export interface Lana8WonderPlan {
  subject_hex: string;
  plan_id: string;
  coin: string;
  currency: string;
  policy: string;
  accounts: Array<{
    account_id: number;
    wallet: string;
    levels: Array<{
      row_id: string;
      level_no: number;
      trigger_price: number;
      coins_to_give: number;
      cash_out: number;
      remaining_lanas: number;
    }>;
  }>;
}

export type PlanReadState = 'found' | 'empty' | 'unreachable';

export interface PlanRead {
  state: PlanReadState;
  /** The parsed plan; set only when `state` is `found`. */
  plan: Lana8WonderPlan | null;
  /** The event the plan came from, for the log. */
  event: Event | null;
  /** Relays that actually answered (connected and reached end-of-stored-events). */
  answered: string[];
  /** Relays that never answered — unreachable, dropped, or still silent at the timeout. */
  silent: string[];
}

export function planFilter(nostrHexId: string): Filter {
  return {
    kinds: [88888],
    '#p': [nostrHexId],
    '#d': [`plan:${nostrHexId}`],
    authors: [KIND_88888_PUBLISHER],
  };
}

/**
 * The verdict, kept pure so it can be tested without a network.
 *
 * Only events from the publisher, for this person's `plan:` d-tag, count —
 * the relay layer already filters, but this is the line that decides what a
 * person is told they own, so it checks again. Among those the newest
 * `created_at` wins: KIND 88888 is a regular kind, relays keep every version,
 * and `events[0]` off a merged array can be a superseded one.
 */
export function classifyPlanRead(input: {
  nostrHexId: string;
  answered: string[];
  silent: string[];
  events: Event[];
}): PlanRead {
  const { nostrHexId, answered, silent, events } = input;
  const d = `plan:${nostrHexId}`;

  const candidates = events.filter(
    (e) =>
      e.kind === 88888 &&
      e.pubkey === KIND_88888_PUBLISHER &&
      e.tags.some((t) => t[0] === 'd' && t[1] === d),
  );

  if (candidates.length > 0) {
    const newest = [...candidates].sort((a, b) => b.created_at - a.created_at)[0];
    let plan: Lana8WonderPlan | null = null;
    try {
      const parsed = JSON.parse(newest.content);
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.accounts)) {
        plan = parsed as Lana8WonderPlan;
      }
    } catch {
      plan = null;
    }
    // A plan exists but its newest version cannot be read. Falling back to an
    // older version would show superseded levels; calling it `empty` would say
    // the person has no plan. Neither is true, so: we cannot say.
    if (!plan) {
      return { state: 'unreachable', plan: null, event: newest, answered, silent };
    }
    return { state: 'found', plan, event: newest, answered, silent };
  }

  // Nothing in hand. That is a fact about the person only if somebody was
  // there to produce it.
  if (answered.length === 0) {
    return { state: 'unreachable', plan: null, event: null, answered: [], silent };
  }
  return { state: 'empty', plan: null, event: null, answered, silent };
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Read KIND 88888 for one person, relay by relay, so that "answered" means a
 * relay that opened a socket and reached end-of-stored-events — not one that
 * the pool gave up on. `ensureRelay` rejects on a connection that never
 * opened, which is the distinction `querySync` erases.
 */
export async function readKind88888(
  nostrHexId: string,
  relayUrls: string[],
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<PlanRead> {
  if (!relayUrls || relayUrls.length === 0) {
    return { state: 'unreachable', plan: null, event: null, answered: [], silent: [] };
  }

  const filter = planFilter(nostrHexId);
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
              // synchronously, which would record this relay as silent.
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
          console.warn(`[kind88888] ${url} did not answer:`, error);
          clearTimeout(timer);
          finish(false);
        });
    });

  try {
    await Promise.all(relayUrls.map(readOne));
  } finally {
    try { pool.close(relayUrls); } catch { /* nothing open */ }
  }

  return classifyPlanRead({ nostrHexId, answered, silent, events });
}
