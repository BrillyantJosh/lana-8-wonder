/**
 * THE REGISTRAR'S FREEZE CODES, IN WORDS A PERSON CAN ACT ON.
 *
 * These strings come back from the registrar as bare codes — `frozen_max_cap`
 * and the like. Shown raw they mean nothing; dropped entirely they leave the
 * person guessing, which is how somebody came to try the same enrolment
 * fourteen times in two days.
 *
 * Every code gets an i18n key. An unknown code is NOT swallowed: the caller
 * falls back to printing the code itself, because a code the person can quote
 * to the registrar beats a polite sentence that says nothing.
 */
export const FREEZE_REASON_KEYS: Record<string, string> = {
  frozen_max_cap: 'freeze.reasonMaxCap',
  frozen_l8w: 'freeze.reasonL8w',
  frozen_too_wild: 'freeze.reasonTooWild',
  frozen_unreg_Lanas: 'freeze.reasonUnregLanas',
  frozen_own_person: 'freeze.reasonOwnPerson',
  frozen: 'freeze.reasonGeneric',
};

/**
 * Translate one code. `t` is react-i18next's translator; when the code is not
 * one we know, the code itself is returned unchanged.
 */
export function freezeReasonLabel(code: string | null | undefined, t: (key: string) => string): string {
  const raw = (code || '').trim();
  if (!raw) return t('freeze.reasonGeneric');
  const key = FREEZE_REASON_KEYS[raw];
  return key ? t(key) : raw;
}

export interface FrozenWalletNote {
  wallet: string;
  reason: string;
}

/**
 * The registrar reports frozen wallets as the strings `describeFrozen` builds:
 * `"LWalletAddress (frozen_max_cap)"`. Older and neighbouring callers send the
 * object form instead. Both are accepted, and anything unrecognisable is kept
 * verbatim as the wallet name rather than dropped — the person needs to see
 * WHICH wallet, and a half-parsed line is still a line they can read.
 */
export function parseFrozenWallets(list: unknown): FrozenWalletNote[] {
  if (!Array.isArray(list)) return [];
  const out: FrozenWalletNote[] = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      const m = entry.match(/^\s*(\S+)\s*\((.*)\)\s*$/);
      if (m) out.push({ wallet: m[1], reason: m[2].trim() });
      else if (entry.trim()) out.push({ wallet: entry.trim(), reason: '' });
      continue;
    }
    if (entry && typeof entry === 'object') {
      const o = entry as Record<string, unknown>;
      const wallet = String(o.wallet_id ?? o.wallet ?? o.wallet_address ?? '').trim();
      const reason = String(o.freeze_reason ?? o.reason ?? '').trim();
      if (wallet) out.push({ wallet, reason });
    }
  }
  return out;
}
