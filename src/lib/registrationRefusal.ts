/**
 * WHEN THE REGISTRAR SAYS NO, SAY WHAT IT SAID.
 *
 * A person tried to enrol in Lana8Wonder fourteen times over two days. Every
 * one of those attempts was refused by the registrar in two or three
 * milliseconds — HTTP 403, `status: 'frozen_account'`, naming her one wallet
 * and the reason it was frozen. The page read `result.message` and
 * `result.data.nostr_broadcasts`, found neither, and threw the refusal away.
 * It then announced "0/8 broadcasts succeeded", walked on to relay
 * verification, found nothing there either — of course, nothing was ever
 * published — and told her in Slovenian that her wallet records "are not on
 * the relays yet".
 *
 * That last sentence is why she kept pressing the button. It describes a
 * network hiccup: wait, retry, it will turn up. Nothing was going to turn up.
 * The server had already given a complete, final answer and the page replaced
 * it with a comforting guess about somebody else's infrastructure.
 *
 * So: this function decides, from the HTTP response alone, whether the server
 * refused. If it did, the page shows the server's own words and STOPS. The
 * relay-verification message stays for what it was written for — a request
 * that was accepted and whose events have not shown up yet.
 *
 * An error shape nobody anticipated is still a refusal. It falls through to
 * `server_message` carrying whatever text the body held, never to silence and
 * never to the relay story.
 */
import { parseFrozenWallets, type FrozenWalletNote } from './freezeReasons';
import { freezeBlocksEnrolment } from './freezePolicy';

export type RefusalKind = 'none' | 'frozen_account' | 'server_message';

export interface RegistrationRefusal {
  kind: RefusalKind;
  /** The server's `status` field, when it sent one. */
  status: string;
  /** Frozen wallets named by the registrar, parsed into wallet + reason. */
  frozenWallets: FrozenWalletNote[];
  /** The server's own words, already trimmed; '' when the body carried none. */
  serverText: string;
  /** HTTP status, for the log line and the support request. */
  httpStatus: number;
  /** The registrar's correlation id, when present — what support will ask for. */
  correlationId: string;
}

const NONE: RegistrationRefusal = {
  kind: 'none',
  status: '',
  frozenWallets: [],
  serverText: '',
  httpStatus: 200,
  correlationId: '',
};

/** Pull whatever human-readable text the body offers, in order of usefulness. */
function textOf(body: Record<string, unknown>): string {
  for (const field of ['message', 'error']) {
    const v = body[field];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (v && typeof v === 'object') {
      const nested = (v as Record<string, unknown>).message;
      if (typeof nested === 'string' && nested.trim()) return nested.trim();
    }
  }
  return '';
}

/**
 * Did the registrar refuse, and in what words?
 *
 * `ok` is `response.ok`. A 2xx whose body says `success: false` is still a
 * refusal — the proxy forwards the registrar's status, but a body that
 * contradicts its status is not something to resolve in the permissive
 * direction.
 */
export function interpretRegistrationResponse(
  httpStatus: number,
  ok: boolean,
  rawBody: unknown,
): RegistrationRefusal {
  const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
  const status = typeof body.status === 'string' ? body.status : '';
  const correlationId = typeof body.correlation_id === 'string' ? body.correlation_id : '';
  const serverText = textOf(body);

  const refused = !ok || body.success === false;

  // "Already registered" is the registrar agreeing that the work is done, not
  // a refusal. It was accepted before this change and stays accepted.
  const lower = serverText.toLowerCase();
  const isAlreadyRegistered =
    lower.includes('already registered') || lower.includes('already exists');

  if (!refused || isAlreadyRegistered) return { ...NONE, httpStatus, status, correlationId, serverText };

  if (status === 'frozen_account') {
    return {
      kind: 'frozen_account',
      status,
      frozenWallets: parseFrozenWallets(body.frozen_wallets),
      serverText,
      httpStatus,
      correlationId,
    };
  }

  return {
    kind: 'server_message',
    status,
    // A freeze can arrive under a status we do not know yet; if the body names
    // wallets, name them too rather than lose them.
    frozenWallets: parseFrozenWallets(body.frozen_wallets),
    serverText,
    httpStatus,
    correlationId,
  };
}

/** True when the flow must stop here and must NOT go on to relay verification. */
export function isRefusal(r: RegistrationRefusal): boolean {
  return r.kind !== 'none';
}

/**
 * Will pressing the button again get the same answer?
 *
 * Only when the refusal is a freeze the policy says blocks. A freeze refusal
 * that names only `frozen_max_cap` / `frozen_own_person` wallets is one the
 * owner has decided to let through (the registrar is being changed to match),
 * so the page must not lock the person out of trying. A frozen_account that
 * names no wallet at all is treated as blocking — we cannot tell, so we do not
 * guess the permissive way. Any other error (a database hiccup, a proxy
 * failure) may well be transient and is never called final.
 */
export function refusalIsFinal(r: RegistrationRefusal): boolean {
  if (r.frozenWallets.length > 0) {
    return r.frozenWallets.some((w) => freezeBlocksEnrolment(true, w.reason));
  }
  return r.kind === 'frozen_account';
}
