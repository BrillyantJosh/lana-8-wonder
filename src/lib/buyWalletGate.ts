/**
 * REFUSE BEFORE THE MONEY, NOT AFTER.
 *
 * The buy wizard asked the registrar two things about the delivery wallet —
 * is it registered, does its owner already hold a plan — and ignored the third
 * thing the very same answer carries: `frozen` and `freeze_reason`. So a
 * person whose account is frozen could walk through to step 4, pay a hundred,
 * and be refused at enrolment, afterwards, with the money already gone.
 *
 * The neighbouring `check-lana8wonder` call is deliberately fail-OPEN: if that
 * check breaks, the worst case is someone enrolling twice, and blocking every
 * buyer over a relay hiccup would be the larger harm. This gate is the
 * opposite case and takes the opposite default. A freeze we could not read is
 * not a freeze that is absent, and the cost of guessing wrong here is a
 * hundred of somebody's money.
 *
 * `frozen` is always present in a registered wallet's answer — the registrar
 * writes `frozen: wallet.frozen ?? false`. Its absence therefore means we are
 * not talking to the registrar we think we are, and that is `check_failed`,
 * not `not frozen`.
 */
export type BuyWalletDecision =
  | 'registered'
  | 'not_registered'
  | 'frozen'
  | 'check_failed';

export interface BuyWalletVerdict {
  decision: BuyWalletDecision;
  /** The frozen wallet address, when the refusal is a freeze. */
  wallet: string;
  /** The registrar's freeze code, '' when it sent none. */
  reason: string;
  /** The registrar's own words, for the `check_failed` case. */
  serverText: string;
}

const base = (decision: BuyWalletDecision): BuyWalletVerdict => ({
  decision,
  wallet: '',
  reason: '',
  serverText: '',
});

/**
 * Read the answer to `/api/check-wallet-registration`.
 *
 * @param ok       `response.ok`
 * @param rawBody  the parsed JSON body, or null when there was none
 * @param threw    true when the request itself failed (network, parse)
 */
export function evaluateWalletCheck(
  ok: boolean,
  rawBody: unknown,
  threw = false,
): BuyWalletVerdict {
  if (threw || !ok) {
    const body = (rawBody && typeof rawBody === 'object' ? rawBody : {}) as Record<string, unknown>;
    const err = body.error;
    const text =
      typeof err === 'string'
        ? err
        : err && typeof err === 'object' && typeof (err as any).message === 'string'
          ? (err as any).message
          : typeof body.message === 'string'
            ? body.message
            : '';
    return { ...base('check_failed'), serverText: String(text || '').trim() };
  }

  const body = (rawBody && typeof rawBody === 'object' ? rawBody : null) as Record<string, unknown> | null;
  if (!body) return base('check_failed');

  if (body.registered !== true) return base('not_registered');

  const wallet = (body.wallet && typeof body.wallet === 'object'
    ? (body.wallet as Record<string, unknown>)
    : null);

  // Registered but no wallet object, or a wallet object with no `frozen` field:
  // we cannot answer the freeze question, so we do not pretend to.
  if (!wallet || !('frozen' in wallet)) return base('check_failed');

  if (wallet.frozen === true) {
    return {
      decision: 'frozen',
      wallet: String(wallet.wallet_id ?? '').trim(),
      reason: String(wallet.freeze_reason ?? '').trim(),
      serverText: '',
    };
  }

  return base('registered');
}
