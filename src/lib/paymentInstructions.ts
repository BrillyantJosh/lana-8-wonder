import type { LanaProfile } from './nostrClient';

/**
 * One normalized set of bank payment instructions.
 *
 * The buy flow needs the very same account details in three places: on the
 * payment step, on the final confirmation page (buyers kept losing them when
 * they moved on) and inside the downloadable PDF. Building them once, here,
 * is what guarantees those three can never drift apart.
 *
 * Everything is derived from the per-domain sources only:
 *  - bank transfer      -> KIND 0 profile of domains.nostr_hex_id_buying_lanas
 *  - international      -> domains.intl_* columns
 * Nothing is hardcoded and there is no fallback account: when a domain has no
 * usable details the builder returns null so the caller can say so plainly
 * instead of showing a blank or somebody else's account.
 */

export interface PaymentInstructionLine {
  label: string;
  value: string;
}

export interface PaymentInstructionBlock {
  lines: PaymentInstructionLine[];
}

export interface PaymentInstructions {
  title: string;
  blocks: PaymentInstructionBlock[];
}

export interface IntlPaymentConfig {
  enable_international_payments: number;
  intl_recipient_name: string;
  intl_bank_name: string;
  intl_bank_address: string;
  intl_iban: string;
  intl_swift: string;
}

export type PaymentMethodChoice = 'card' | 'transfer' | 'international' | null;

type Translate = (key: string) => string;

/** Append a line only when there is a real value — never a blank row. */
function push(lines: PaymentInstructionLine[], label: string, value: unknown): void {
  if (value === null || value === undefined) return;
  const text = String(value).trim();
  if (!text) return;
  lines.push({ label, value: text });
}

/**
 * Field keys we know how to label. Anything else in `fields` is still shown
 * (humanized) rather than dropped — for money instructions, silently hiding a
 * field a bank needs is worse than an ugly label.
 */
function knownFieldLabel(key: string, t: Translate): string | null {
  switch (key) {
    case 'iban': return 'IBAN';
    case 'bic': return 'BIC';
    case 'swift': return 'SWIFT';
    case 'account_number': return t('buyLana.fieldAccount');
    case 'sort_code': return t('buyLana.fieldSortCode');
    case 'routing_number': return t('buyLana.fieldRoutingNumber');
    case 'bank_name': return t('buyLana.step4IntlBankName');
    case 'bank_address': return t('buyLana.step4IntlBankAddr');
    default: return null;
  }
}

function humanizeKey(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Ordered so the fields a bank form asks for first come first. */
const FIELD_ORDER = [
  'iban',
  'account_number',
  'sort_code',
  'routing_number',
  'bic',
  'swift',
  'bank_name',
  'bank_address',
];

/** Fields rendered elsewhere in the block, so they must not repeat. */
const FIELDS_HANDLED_SEPARATELY = ['account_holder'];

export function buildPaymentInstructions(args: {
  method: PaymentMethodChoice;
  buyerProfile: LanaProfile | null;
  intlConfig: IntlPaymentConfig | null;
  currency: string;
  t: Translate;
}): PaymentInstructions | null {
  const { method, buyerProfile, intlConfig, currency, t } = args;

  if (method === 'transfer') {
    if (!buyerProfile) return null;

    const profileHolder = buyerProfile.display_name || buyerProfile.name || '';
    const blocks: PaymentInstructionBlock[] = [];

    const collectMethods = (buyerProfile.payment_methods || []).filter(
      (pm) => pm.scope === 'collect' || pm.scope === 'both'
    );

    if (collectMethods.length > 0) {
      for (const pm of collectMethods) {
        const fields: Record<string, unknown> = (pm.fields || {}) as Record<string, unknown>;
        const lines: PaymentInstructionLine[] = [];

        push(lines, t('buyLana.fieldAccountHolder'), fields.account_holder || profileHolder);
        push(lines, t('buyLana.fieldAddress'), buyerProfile.location);
        push(lines, t('buyLana.fieldCountry'), buyerProfile.country);
        push(lines, t('buyLana.fieldMethod'), pm.label || pm.scheme);

        const rendered = new Set<string>(FIELDS_HANDLED_SEPARATELY);
        for (const key of FIELD_ORDER) {
          if (!(key in fields)) continue;
          rendered.add(key);
          push(lines, knownFieldLabel(key, t) || humanizeKey(key), fields[key]);
        }
        // Anything the scheme carries that we did not anticipate.
        for (const key of Object.keys(fields)) {
          if (rendered.has(key)) continue;
          push(lines, knownFieldLabel(key, t) || humanizeKey(key), fields[key]);
        }

        push(lines, t('buyLana.step4IntlCurrency'), pm.currency);

        // A block is only usable if it actually identifies an account to pay.
        const payable = String(fields.iban || '').trim() || String(fields.account_number || '').trim();
        if (payable) blocks.push({ lines });
      }
    } else if (buyerProfile.bankAccount || buyerProfile.bankName) {
      // Legacy profiles carry flat bank* fields instead of payment_methods.
      const lines: PaymentInstructionLine[] = [];
      push(lines, t('buyLana.fieldAccountHolder'), profileHolder);
      push(lines, t('buyLana.fieldAddress'), buyerProfile.location);
      push(lines, t('buyLana.fieldCountry'), buyerProfile.country);
      push(lines, t('buyLana.step4IntlBankName'), buyerProfile.bankName);
      push(lines, t('buyLana.fieldAccount'), buyerProfile.bankAccount);
      push(lines, 'SWIFT', buyerProfile.bankSWIFT);
      push(lines, t('buyLana.step4IntlBankAddr'), buyerProfile.bankAddress);

      if (String(buyerProfile.bankAccount || '').trim()) blocks.push({ lines });
    }

    if (blocks.length === 0) return null;
    return { title: t('buyLana.step4BankDetails'), blocks };
  }

  if (method === 'international') {
    if (!intlConfig) return null;

    const lines: PaymentInstructionLine[] = [];
    push(lines, t('buyLana.step4IntlRecipient'), intlConfig.intl_recipient_name);
    push(lines, 'IBAN', intlConfig.intl_iban);
    push(lines, 'SWIFT/BIC', intlConfig.intl_swift);
    push(lines, t('buyLana.step4IntlBankName'), intlConfig.intl_bank_name);
    push(lines, t('buyLana.step4IntlBankAddr'), intlConfig.intl_bank_address);
    push(lines, t('buyLana.step4IntlCurrency'), currency);

    if (!String(intlConfig.intl_iban || '').trim()) return null;
    return { title: t('buyLana.step4IntlBankDetails'), blocks: [{ lines }] };
  }

  return null;
}
